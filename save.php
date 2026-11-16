<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$room = isset($_GET['room']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['room']) : 'default';
if (empty($room)) { $room = 'default'; }

$filename = __DIR__ . '/state_' . $room . '.json';
$expire_seconds = 6 * 3600; // 6時間で自動消去

// 古い保存ファイルの自動クリーンアップ
if (file_exists($filename)) {
    if ((time() - filemtime($filename)) > $expire_seconds) {
        @unlink($filename);
    }
}

// 消去リクエスト（DELETE または action=clear）
if ($_SERVER['REQUEST_METHOD'] === 'DELETE' || isset($_GET['action']) && $_GET['action'] === 'clear') {
    if (file_exists($filename)) {
        @unlink($filename);
    }
    echo json_encode(['status' => 'cleared']);
    exit;
}

// 保存処理（POST）
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

// 取得処理（GET）
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (file_exists($filename)) {
        echo file_get_contents($filename);
    } else {
        echo json_encode(['status' => 'empty']);
    }
    exit;
}
?>