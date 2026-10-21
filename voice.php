<?php
// voice.php
header('Access-Control-Allow-Origin: *');
header('Content-Type: audio/wav');

$text = isset($_GET['text']) ? $_GET['text'] : '';
$speaker = isset($_GET['speaker']) ? $_GET['speaker'] : '3';

if (empty($text)) {
    http_response_code(400);
    exit('No text provided');
}

$apiUrl = "https://api.su-shiki.com/v2/voicevox/audio?text=" . urlencode($text) . "&speaker=" . intval($speaker);

// サーバー側でVOICEVOX APIから音声を取得
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $apiUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 15);
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)');

$audioData = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode === 200 && $audioData) {
    echo $audioData;
} else {
    http_response_code(500);
    echo 'Failed to fetch audio';
}
?>