<?php
// POST api/bonus.php  { name, code, website } -> { ok, name, tickets, state }
// Redeems one single-use bonus code for one extra ticket on an existing entry.
require __DIR__ . '/lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Method not allowed', 405);

$body = request_body();
if (!empty($body['website'])) respond(['ok' => true], 200); // honeypot

$name = clip(tidy($body['name'] ?? ''), 80);
$code = normalize_code($body['code'] ?? '');
$key = key_for($name);
if ($key === '') fail('Enter the name you used for your raffle entry.');
if ($code === '') fail('Bonus codes look like CSF-7KQ2X. Check the code and try again.');

// Slow down code guessing: 10 wrong codes per internet address per 10 minutes.
const TRIES_FILE = DATA_DIR . '/bonus-tries.php';
const TRIES_LIMIT = 10;
const TRIES_WINDOW_MS = 600000;
function tries(callable $fn) {
  ensure_data_dir();
  $h = fopen(TRIES_FILE, 'c+');
  if (!$h) return $fn([])[1];
  flock($h, LOCK_EX);
  $raw = stream_get_contents($h);
  if (strncmp($raw, DATA_GUARD, strlen(DATA_GUARD)) === 0) $raw = substr($raw, strlen(DATA_GUARD));
  $all = json_decode($raw ?: '[]', true) ?: [];
  $cut = now_ms() - TRIES_WINDOW_MS;
  foreach ($all as $k => $list) {
    $all[$k] = array_values(array_filter($list, fn($t) => $t > $cut));
    if (!$all[$k]) unset($all[$k]);
  }
  [$all, $out] = $fn($all);
  ftruncate($h, 0); rewind($h);
  fwrite($h, DATA_GUARD . json_encode($all));
  flock($h, LOCK_UN); fclose($h);
  return $out;
}
$who = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|raffle-bonus');
$blocked = tries(fn($all) => [$all, count($all[$who] ?? []) >= TRIES_LIMIT]);
if ($blocked) fail('Too many wrong codes. Wait a few minutes and try again.', 429);

$r = update_state(function (array &$s) use ($key, $name, $code) {
  $st = raffle_status($s);
  if ($st === 'before') return ['error' => 'The raffle isn\'t open yet. Enter first, then add your code.', 'status' => 403];
  if ($st === 'closed') return ['error' => 'Raffle entries are closed, so bonus codes can\'t be added now.', 'status' => 403];

  $ci = null;
  foreach ($s['codes'] ?? [] as $i => $c) if ($c['code'] === $code) { $ci = $i; break; }
  if ($ci === null) return ['error' => 'That code isn\'t valid. Check it and try again.', 'status' => 400, 'wrong' => true];
  if (!empty($s['codes'][$ci]['usedBy'])) return ['error' => 'That code has already been used.', 'status' => 409];

  $ei = null;
  foreach ($s['entries'] as $i => $e) if ($e['id'] === $key) { $ei = $i; break; }
  if ($ei === null) return ['error' => "We couldn't find “{$name}” in the raffle. Enter the raffle first, then add your code with the same name.", 'status' => 404];

  $have = tickets_of($s['entries'][$ei]);
  if ($have >= MAX_TICKETS) return ['error' => "{$s['entries'][$ei]['name']} already has the most tickets allowed (" . MAX_TICKETS . "). Pass this code on to someone else.", 'status' => 409];

  $s['entries'][$ei]['tickets'] = $have + 1;
  $s['codes'][$ci]['usedBy'] = $key;
  $s['codes'][$ci]['usedByName'] = $s['entries'][$ei]['name'];
  $s['codes'][$ci]['usedAt'] = now_ms();
  return ['ok' => true, 'name' => $s['entries'][$ei]['name'], 'tickets' => $have + 1];
});

if (isset($r['error'])) {
  if (!empty($r['wrong'])) {
    tries(function ($all) use ($who) { $all[$who][] = now_ms(); return [$all, null]; });
  }
  fail($r['error'], $r['status'] ?? 400);
}
respond($r);
