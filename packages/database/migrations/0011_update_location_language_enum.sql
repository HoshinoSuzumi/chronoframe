UPDATE `settings`
SET `enum` = '["zh","zh-TW","zh-HK","en","ja","ru"]'
WHERE `namespace` = 'location' AND `key` = 'language';
