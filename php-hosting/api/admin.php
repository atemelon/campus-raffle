<?php
// POST api/admin.php  header "X-Organizer-Code"; every reply includes the current `state`.
// body { action, ... }:
//   check
//   addPrize    { name, description?, quantity }
//   updatePrize { id, name?, description?, quantity? }
//   deletePrize { id }                   also clears that prize's winners
//   draw        { prizeId }              one winner; a person can win at most one prize
//   unwin       { prizeId, entryId }     undo a winner (no-show), freeing the slot
//   remove      { id }                   delete one entry
//   reset       { keepPrizes: true }     clear entries and winners (and prizes if keepPrizes is false)
require __DIR__ . '/lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Method not allowed', 405);
if (ORGANIZER_CODE === '' || ORGANIZER_CODE === 'change-me') {
  fail('Set ORGANIZER_CODE in api/config.php first.', 500);
}
$given = (string) ($_SERVER['HTTP_X_ORGANIZER_CODE'] ?? '');
if (!hash_equals(ORGANIZER_CODE, $given)) {
  usleep(300000); // slow down guessing
  fail('That organizer code isn\'t right.', 401);
}

$body = request_body();
$action = $body['action'] ?? '';

function qty($v): ?int {
  if (!is_numeric($v)) return null;
  $n = (int) floor((float) $v);
  return ($n >= 1 && $n <= 999) ? $n : null;
}
const QTY_ERR = ['error' => 'Quantity must be a whole number from 1 to 999.', 'status' => 400];

switch ($action) {
  case 'check':
    respond(['ok' => true, 'state' => read_state()]);

  case 'addPrize':
    $name = clip(tidy($body['name'] ?? ''), 80);
    $description = clip(tidy($body['description'] ?? ''), 200);
    $quantity = qty($body['quantity'] ?? null);
    if ($name === '') fail('Give the prize a name.');
    if (!$quantity) fail(QTY_ERR['error']);
    $r = update_state(function (array &$s) use ($name, $description, $quantity) {
      if (count($s['prizes']) >= 100) return ['error' => 'You can list up to 100 prizes.', 'status' => 400];
      $s['prizes'][] = ['id' => 'p' . bin2hex(random_bytes(4)), 'name' => $name, 'description' => $description, 'quantity' => $quantity, 'createdAt' => now_ms()];
      return [];
    });
    break;

  case 'updatePrize':
    $r = update_state(function (array &$s) use ($body) {
      foreach ($s['prizes'] as &$p) {
        if ($p['id'] !== ($body['id'] ?? null)) continue;
        if (array_key_exists('name', $body)) {
          $n = clip(tidy($body['name']), 80);
          if ($n === '') return ['error' => 'Give the prize a name.', 'status' => 400];
          $p['name'] = $n;
        }
        if (array_key_exists('description', $body)) $p['description'] = clip(tidy($body['description']), 200);
        if (array_key_exists('quantity', $body)) {
          $q = qty($body['quantity']);
          if (!$q) return QTY_ERR;
          $p['quantity'] = $q;
        }
        return [];
      }
      return ['error' => 'That prize no longer exists.', 'status' => 404];
    });
    break;

  case 'deletePrize':
    $id = (string) ($body['id'] ?? '');
    $r = update_state(function (array &$s) use ($id) {
      $s['prizes'] = array_values(array_filter($s['prizes'], fn($p) => $p['id'] !== $id));
      $s['winners'] = array_values(array_filter($s['winners'], fn($w) => $w['prizeId'] !== $id));
      foreach ($s['entries'] as &$e) $e['prizes'] = array_values(array_filter($e['prizes'], fn($x) => $x !== $id));
      return [];
    });
    break;

  case 'draw':
    $prizeId = (string) ($body['prizeId'] ?? '');
    $r = update_state(function (array &$s) use ($prizeId) {
      $prize = null;
      foreach ($s['prizes'] as $p) if ($p['id'] === $prizeId) $prize = $p;
      if (!$prize) return ['error' => 'That prize no longer exists.', 'status' => 404];
      $awarded = count(array_filter($s['winners'], fn($w) => $w['prizeId'] === $prizeId));
      if ($awarded >= $prize['quantity']) return ['error' => "All {$prize['quantity']} of “{$prize['name']}” have been awarded.", 'status' => 409];
      $won = array_column($s['winners'], 'entryId');
      $pool = array_values(array_filter($s['entries'], fn($e) => in_array($prizeId, $e['prizes'], true) && !in_array($e['id'], $won, true)));
      if (!$pool) return ['error' => "Nobody left to draw for “{$prize['name']}”.", 'status' => 409];
      $pick = $pool[random_int(0, count($pool) - 1)];
      $s['winners'][] = ['prizeId' => $prizeId, 'entryId' => $pick['id'], 'name' => $pick['name'], 'major' => $pick['major'], 'at' => now_ms()];
      return [
        'winner' => $pick,
        'prize' => $prize,
        'pool' => array_map(fn($e) => ['name' => $e['name'], 'major' => $e['major']], $pool),
      ];
    });
    break;

  case 'unwin':
    $prizeId = (string) ($body['prizeId'] ?? '');
    $entryId = (string) ($body['entryId'] ?? '');
    $r = update_state(function (array &$s) use ($prizeId, $entryId) {
      $s['winners'] = array_values(array_filter($s['winners'], fn($w) => !($w['prizeId'] === $prizeId && $w['entryId'] === $entryId)));
      return [];
    });
    break;

  case 'remove':
    $id = (string) ($body['id'] ?? '');
    if ($id === '') fail('Missing entry id.');
    $r = update_state(function (array &$s) use ($id) {
      $s['entries'] = array_values(array_filter($s['entries'], fn($e) => $e['id'] !== $id));
      $s['winners'] = array_values(array_filter($s['winners'], fn($w) => $w['entryId'] !== $id));
      return [];
    });
    break;

  case 'reset':
    $keepPrizes = ($body['keepPrizes'] ?? true) !== false;
    $r = update_state(function (array &$s) use ($keepPrizes) {
      $s['entries'] = [];
      $s['winners'] = [];
      if (!$keepPrizes) $s['prizes'] = [];
      return [];
    });
    break;

  default:
    fail('Unknown action.');
}

if (isset($r['error'])) fail($r['error'], $r['status'] ?? 400);
respond(['ok' => true] + $r);
