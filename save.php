<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

// URLから部屋IDを取得
$room = isset($_GET['room']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['room']) : 'default';
if (empty($room)) {
    $room = 'default';
}

$filename = __DIR__ . '/state_' . $room . '.json';

// 【保存】操作時（POST）
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $json = file_get_contents('php://input');
    if ($json) {
        file_put_contents($filename, $json);
        echo json_encode(['status' => 'success', 'room' => $room]);
    } else {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'データが空です']);
    }
    exit;
}

// 【取得】閲覧側（GET）
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (file_exists($filename)) {
        echo file_get_contents($filename);
    } else {
        echo json_encode(['status' => 'empty']);
    }
    exit;
}
?>