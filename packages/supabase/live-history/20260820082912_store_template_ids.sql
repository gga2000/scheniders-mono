do $$
begin
  if to_regclass('public.industries') is null then
    return;
  end if;

  update public.industries
  set recommended_template_id = case recommended_template_id
        when 'sale_page'             then 'sunbleach'
        when 'product_launch'        then 'aurora_glass'
        when 'brand_story'           then 'cobalt_broadsheet'
        when 'iraqi_market_landing'  then 'kinetic_ink'
        when 'minimal_catalog'       then 'chrome_night'
        else recommended_template_id
      end
  where recommended_template_id in (
    'sale_page',
    'product_launch',
    'brand_story',
    'iraqi_market_landing',
    'minimal_catalog'
  );
end
$$;;
