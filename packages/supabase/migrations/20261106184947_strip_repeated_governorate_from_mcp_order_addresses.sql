update public.orders
set address_details = regexp_replace(address_details, '^(محافظة )?(' || city || '|الديوانية|واسط)\s*[/\-–•،,]\s*', '')
where created_via = 'claude'
  and deleted_at is null
  and address_details ~ ('^(محافظة )?(' || city || '|الديوانية|واسط)\s*[/\-–•،,]\s*.');
