UPDATE public.tenants
   SET config_version = 2
 WHERE store_config_v2 IS NOT NULL
   AND config_version IS DISTINCT FROM 2;;
