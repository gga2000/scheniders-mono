-- R8-01 (part): one uploaded receipt file backs at most one top-up request.
ALTER TABLE public.wallet_topup_requests
  ADD CONSTRAINT wallet_topup_requests_receipt_path_key UNIQUE (receipt_path);
