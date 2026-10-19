<?php
// GET  api/entries.php  -> { prizes, entries, winners, updatedAt }
// POST api/entries.php  { name, major, prizes: [prizeId], website } -> 201 + state | 409 duplicate | 400 invalid
require __DIR__ . '/lib.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
  respond(read_state());
}

if ($method !== 'POST') fail('Method not allowed', 405);

$body = request_body();

// Honeypot: real people never fill this hidden field.
if (!empty($body['website'])) respond(['ok' => true], 201);

$name = clip(tidy($body['name'] ?? ''), 80);
$major = clip(tidy($body['major'] ?? ''), 80);
if (mb_strlen($name, 'UTF-8') < 2) fail('Add your full name to enter.');
if (!in_array($major, AREAS, true)) fail('Choose your area of study from the list.');
$key = key_for($name);
if ($key === '') fail('Use letters or numbers in your name.');
$wanted = array_values(array_unique(array_map('strval', is_array($body['prizes'] ?? null) ? $body['prizes'] : [])));

$r = update_state(function (array &$s) use ($name, $major, $key, $wanted) {
  if (!$s['prizes']) return ['error' => 'Prizes aren\'t listed yet. Check back soon.', 'status' => 400];
  $valid = array_column($s['prizes'], 'id');
  $picked = array_values(array_filter($wanted, fn($id) => in_array($id, $valid, true)));
  if (!$picked) return ['error' => 'Choose at least one prize to enter for.', 'status' => 400];
  foreach ($s['entries'] as $e) {
    if ($e['id'] === $key) return ['error' => "“{$name}” is already entered. Each name gets one entry.", 'status' => 409];
  }
  if (count($s['entries']) >= 2000) return ['error' => 'The raffle is full. Ask an organizer for help.', 'status' => 400];
  $s['entries'][] = ['id' => $key, 'name' => $name, 'major' => $major, 'prizes' => $picked, 'createdAt' => now_ms()];
  return ['ok' => true, 'name' => $name];
});

if (isset($r['error'])) fail($r['error'], $r['status'] ?? 400);
respond($r, 201);
