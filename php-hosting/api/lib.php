<?php
// Shared helpers. All raffle data lives in one JSON file:
// { prizes: [{id,name,description,quantity,createdAt}],
//   entries: [{id,name,major,prizes:[prizeId],createdAt}],
//   winners: [{prizeId,entryId,name,major,at}], updatedAt }

require __DIR__ . '/config.php';

const DATA_DIR = __DIR__ . '/../data';
const DATA_FILE = DATA_DIR . '/raffle-data.php';
// The data file starts with a PHP guard, so even if the folder's .htaccess rule
// is ignored, opening it in a browser shows nothing.
const DATA_GUARD = "<?php http_response_code(404); exit; ?>\n";
const LOCK_FILE = DATA_DIR . '/raffle.lock';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond($data, int $status = 200): void {
  http_response_code($status);
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function fail(string $message, int $status = 400): void {
  respond(['error' => $message], $status);
}

function now_ms(): int {
  return (int) round(microtime(true) * 1000);
}

function tidy($s): string {
  $s = is_string($s) ? $s : '';
  if (class_exists('Normalizer')) $s = Normalizer::normalize($s, Normalizer::FORM_C) ?: $s;
  return trim(preg_replace('/\s+/u', ' ', $s));
}

function clip(string $s, int $n): string {
  return mb_substr($s, 0, $n, 'UTF-8');
}

// Case-, accent- and spacing-insensitive key, so "Jordan Alvarez" and "jordan  alvarez" collide.
function key_for(string $name): string {
  $base = mb_strtolower(tidy($name), 'UTF-8');
  if (class_exists('Normalizer')) {
    $base = Normalizer::normalize($base, Normalizer::FORM_D) ?: $base;
    $base = preg_replace('/\p{Mn}/u', '', $base);
  }
  $out = '';
  foreach (preg_split('//u', $base, -1, PREG_SPLIT_NO_EMPTY) as $ch) {
    if (preg_match('/^[a-z0-9]$/', $ch)) $out .= $ch;
    elseif ($ch === ' ') $out .= '-';
    else $out .= '_' . dechex(mb_ord($ch, 'UTF-8'));
  }
  return substr($out, 0, 300);
}

function empty_state(): array {
  return ['prizes' => [], 'entries' => [], 'winners' => [], 'updatedAt' => 0];
}

function read_state(): array {
  if (!is_file(DATA_FILE)) return empty_state();
  $raw = (string) file_get_contents(DATA_FILE);
  if (strncmp($raw, DATA_GUARD, strlen(DATA_GUARD)) === 0) $raw = substr($raw, strlen(DATA_GUARD));
  $s = json_decode($raw, true);
  if (!is_array($s)) return empty_state();
  return array_merge(empty_state(), $s);
}

function ensure_data_dir(): void {
  if (!is_dir(DATA_DIR) && !@mkdir(DATA_DIR, 0755, true)) {
    fail('The server can\'t create the data folder. Make the "data" folder writable.', 500);
  }
  if (!is_writable(DATA_DIR)) {
    fail('The server can\'t save entries. Make the "data" folder writable.', 500);
  }
}

// Read, change and save the state while holding an exclusive lock,
// so simultaneous entries and draws never overwrite each other.
// $change receives the state by reference and returns extra response data,
// or ['error' => ..., 'status' => ...] to abort without saving.
function update_state(callable $change): array {
  ensure_data_dir();
  $lock = fopen(LOCK_FILE, 'c');
  if (!$lock || !flock($lock, LOCK_EX)) fail('The raffle is busy right now. Try again in a moment.', 503);
  try {
    $state = read_state();
    $result = $change($state) ?? [];
    if (isset($result['error'])) return $result;
    $state['updatedAt'] = max(now_ms(), ($state['updatedAt'] ?? 0) + 1);
    $tmp = DATA_FILE . '.tmp.php';
    $json = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (file_put_contents($tmp, DATA_GUARD . $json) === false || !rename($tmp, DATA_FILE)) {
      return ['error' => 'The entry couldn\'t be saved. Try again.', 'status' => 500];
    }
    $result['state'] = $state;
    return $result;
  } finally {
    flock($lock, LOCK_UN);
    fclose($lock);
  }
}

function request_body(): array {
  $b = json_decode(file_get_contents('php://input') ?: '', true);
  return is_array($b) ? $b : [];
}
