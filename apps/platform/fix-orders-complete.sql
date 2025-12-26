-- Complete SQL to fix all imported orders
-- Tries multiple order_id formats to ensure matching
-- Run this in Supabase SQL Editor

-- Order 5491
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5491' OR order_id = 'LF-5491' OR order_id LIKE '%5491';
-- Order 5492
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5492' OR order_id = 'LF-5492' OR order_id LIKE '%5492';
-- Order 5493
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5493' OR order_id = 'LF-5493' OR order_id LIKE '%5493';
-- Order 5494
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5494' OR order_id = 'LF-5494' OR order_id LIKE '%5494';
-- Order 5495
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5495' OR order_id = 'LF-5495' OR order_id LIKE '%5495';
-- Order 5496
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5496' OR order_id = 'LF-5496' OR order_id LIKE '%5496';
-- Order 5497
UPDATE orders SET price = 150000, items = '[{"name":"عطر برسيفيرون / رفقات ابيض","price":75000,"quantity":2}]'::jsonb WHERE order_id = '5497' OR order_id = 'LF-5497' OR order_id LIKE '%5497';
-- Order 5499
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5499' OR order_id = 'LF-5499' OR order_id LIKE '%5499';
-- Order 5500
UPDATE orders SET price = 38500, items = '[{"name":"عطر ايدنتتي من باريس كورنر للرجال","price":38500,"quantity":1}]'::jsonb WHERE order_id = '5500' OR order_id = 'LF-5500' OR order_id LIKE '%5500';
-- Order 5501
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5501' OR order_id = 'LF-5501' OR order_id LIKE '%5501';
-- Order 10043
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '10043' OR order_id = 'LF-10043' OR order_id LIKE '%10043';
-- Order 10044
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '10044' OR order_id = 'LF-10044' OR order_id LIKE '%10044';
-- Order Abandoned checkout
UPDATE orders SET price = 358000, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1},{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1},{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1},{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1},{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1},{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1},{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1},{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = 'Abandoned checkout' OR order_id = 'LF-Abandoned checkout' OR order_id LIKE '%Abandoned checkout';
-- Order 5502
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5502' OR order_id = 'LF-5502' OR order_id LIKE '%5502';
-- Order 5503
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5503' OR order_id = 'LF-5503' OR order_id LIKE '%5503';
-- Order 5504
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5504' OR order_id = 'LF-5504' OR order_id LIKE '%5504';
-- Order 5505
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5505' OR order_id = 'LF-5505' OR order_id LIKE '%5505';
-- Order 5506
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5506' OR order_id = 'LF-5506' OR order_id LIKE '%5506';
-- Order 10045
UPDATE orders SET price = 150000, items = '[{"name":"عطر برسيفيرون / رفقات ابيض","price":75000,"quantity":2}]'::jsonb WHERE order_id = '10045' OR order_id = 'LF-10045' OR order_id LIKE '%10045';
-- Order 5507
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5507' OR order_id = 'LF-5507' OR order_id LIKE '%5507';
-- Order 5508
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5508' OR order_id = 'LF-5508' OR order_id LIKE '%5508';
-- Order 10049
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '10049' OR order_id = 'LF-10049' OR order_id LIKE '%10049';
-- Order 5509
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5509' OR order_id = 'LF-5509' OR order_id LIKE '%5509';
-- Order 5510
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5510' OR order_id = 'LF-5510' OR order_id LIKE '%5510';
-- Order 5511
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5511' OR order_id = 'LF-5511' OR order_id LIKE '%5511';
-- Order 20005
UPDATE orders SET price = 146000, items = '[{"name":"عطر برسيفيرون / فيوجن","price":73000,"quantity":2}]'::jsonb WHERE order_id = '20005' OR order_id = 'LF-20005' OR order_id LIKE '%20005';
-- Order 10046
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '10046' OR order_id = 'LF-10046' OR order_id LIKE '%10046';
-- Order 20006
UPDATE orders SET price = 36750, items = '[{"name":"عطر خير فيوجن الفاخر من باريس كورنر","price":36750,"quantity":1}]'::jsonb WHERE order_id = '20006' OR order_id = 'LF-20006' OR order_id LIKE '%20006';
-- Order 10047
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '10047' OR order_id = 'LF-10047' OR order_id LIKE '%10047';
-- Order 10048
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '10048' OR order_id = 'LF-10048' OR order_id LIKE '%10048';
-- Order 10050
UPDATE orders SET price = 38500, items = '[{"name":"عطر ايدنتتي من باريس كورنر للرجال","price":38500,"quantity":1}]'::jsonb WHERE order_id = '10050' OR order_id = 'LF-10050' OR order_id LIKE '%10050';
-- Order 10051
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '10051' OR order_id = 'LF-10051' OR order_id LIKE '%10051';
-- Order 20007
UPDATE orders SET price = 318000, items = '[{"name":"بيرسفيرون / فيوجن / ايدينتتي","price":106000,"quantity":3}]'::jsonb WHERE order_id = '20007' OR order_id = 'LF-20007' OR order_id LIKE '%20007';
-- Order 5474
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5474' OR order_id = 'LF-5474' OR order_id LIKE '%5474';
-- Order 5512
UPDATE orders SET price = 150000, items = '[{"name":"عطر برسيفيرون / رفقات ابيض","price":75000,"quantity":2}]'::jsonb WHERE order_id = '5512' OR order_id = 'LF-5512' OR order_id LIKE '%5512';
-- Order 5513
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5513' OR order_id = 'LF-5513' OR order_id LIKE '%5513';
-- Order 5514
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5514' OR order_id = 'LF-5514' OR order_id LIKE '%5514';
-- Order 5515
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5515' OR order_id = 'LF-5515' OR order_id LIKE '%5515';
-- Order 5516
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5516' OR order_id = 'LF-5516' OR order_id LIKE '%5516';
-- Order 5517
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5517' OR order_id = 'LF-5517' OR order_id LIKE '%5517';
-- Order 10058
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '10058' OR order_id = 'LF-10058' OR order_id LIKE '%10058';
-- Order 5518
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5518' OR order_id = 'LF-5518' OR order_id LIKE '%5518';
-- Order 10052
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '10052' OR order_id = 'LF-10052' OR order_id LIKE '%10052';
-- Order 10053
UPDATE orders SET price = 39000, items = '[{"name":"عطر رفقات وايت الفاخر من باريس كورنر","price":39000,"quantity":1}]'::jsonb WHERE order_id = '10053' OR order_id = 'LF-10053' OR order_id LIKE '%10053';
-- Order 10054
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '10054' OR order_id = 'LF-10054' OR order_id LIKE '%10054';
-- Order 10055
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '10055' OR order_id = 'LF-10055' OR order_id LIKE '%10055';
-- Order 10056
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '10056' OR order_id = 'LF-10056' OR order_id LIKE '%10056';
-- Order 10057
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '10057' OR order_id = 'LF-10057' OR order_id LIKE '%10057';
-- Order 20008
UPDATE orders SET price = 318000, items = '[{"name":"بيرسفيرون+رفقات + فيوجن","price":106000,"quantity":3}]'::jsonb WHERE order_id = '20008' OR order_id = 'LF-20008' OR order_id LIKE '%20008';
-- Order 10059
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '10059' OR order_id = 'LF-10059' OR order_id LIKE '%10059';
-- Order 5520
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5520' OR order_id = 'LF-5520' OR order_id LIKE '%5520';
-- Order 5521
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5521' OR order_id = 'LF-5521' OR order_id LIKE '%5521';
-- Order 5522
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5522' OR order_id = 'LF-5522' OR order_id LIKE '%5522';
-- Order 5523
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5523' OR order_id = 'LF-5523' OR order_id LIKE '%5523';
-- Order 5524
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5524' OR order_id = 'LF-5524' OR order_id LIKE '%5524';
-- Order 5525
UPDATE orders SET price = 146000, items = '[{"name":"عطر برسيفيرون / فيوجن","price":73000,"quantity":2}]'::jsonb WHERE order_id = '5525' OR order_id = 'LF-5525' OR order_id LIKE '%5525';
-- Order 5526
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5526' OR order_id = 'LF-5526' OR order_id LIKE '%5526';
-- Order 5527
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5527' OR order_id = 'LF-5527' OR order_id LIKE '%5527';
-- Order 5528
UPDATE orders SET price = 146000, items = '[{"name":"عطر برسيفيرون / فيوجن","price":73000,"quantity":2}]'::jsonb WHERE order_id = '5528' OR order_id = 'LF-5528' OR order_id LIKE '%5528';
-- Order 5530
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5530' OR order_id = 'LF-5530' OR order_id LIKE '%5530';
-- Order 5531
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5531' OR order_id = 'LF-5531' OR order_id LIKE '%5531';
-- Order 10060
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '10060' OR order_id = 'LF-10060' OR order_id LIKE '%10060';
-- Order 5519
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5519' OR order_id = 'LF-5519' OR order_id LIKE '%5519';
-- Order 5532
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5532' OR order_id = 'LF-5532' OR order_id LIKE '%5532';
-- Order 5533
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5533' OR order_id = 'LF-5533' OR order_id LIKE '%5533';
-- Order 5534
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5534' OR order_id = 'LF-5534' OR order_id LIKE '%5534';
-- Order 5535
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5535' OR order_id = 'LF-5535' OR order_id LIKE '%5535';
-- Order 10061
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '10061' OR order_id = 'LF-10061' OR order_id LIKE '%10061';
-- Order 5536
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5536' OR order_id = 'LF-5536' OR order_id LIKE '%5536';
-- Order 5537
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5537' OR order_id = 'LF-5537' OR order_id LIKE '%5537';
-- Order 5538
UPDATE orders SET price = 38500, items = '[{"name":"عطر ايدنتتي من باريس كورنر للرجال","price":38500,"quantity":1}]'::jsonb WHERE order_id = '5538' OR order_id = 'LF-5538' OR order_id LIKE '%5538';
-- Order 5539
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5539' OR order_id = 'LF-5539' OR order_id LIKE '%5539';
-- Order 5540
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5540' OR order_id = 'LF-5540' OR order_id LIKE '%5540';
-- Order 5541
UPDATE orders SET price = 44750, items = '[{"name":"عطر برسيفيرون الفاخر من باريس كورنر للرجال","price":44750,"quantity":1}]'::jsonb WHERE order_id = '5541' OR order_id = 'LF-5541' OR order_id LIKE '%5541';

-- Total: 74 orders

-- Verify the fix:
SELECT order_id, price, items FROM orders WHERE source = 'excel_import' LIMIT 10;
