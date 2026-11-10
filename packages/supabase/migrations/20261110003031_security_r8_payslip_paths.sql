-- Security round 8 (R6-06): payroll_records.pdf_url holds the storage path
-- (<payroll id>.pdf), never a signed link; the payroll page signs 1-hour
-- links on read. Convert the old 10-year links and keep it a path.
UPDATE public.payroll_records
   SET pdf_url = substring(pdf_url from '/object/sign/payroll-pdfs/([^?]+)')
 WHERE pdf_url ~ '/object/sign/payroll-pdfs/';

ALTER TABLE public.payroll_records
    ADD CONSTRAINT payroll_records_pdf_url_is_path
    CHECK (pdf_url IS NULL OR pdf_url ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$');
