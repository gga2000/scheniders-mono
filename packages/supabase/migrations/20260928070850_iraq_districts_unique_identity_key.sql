-- Replace the folded-name uniqueness with the stronger identity key, so neither a spelling
-- variant nor a leading type word can reintroduce a duplicate district.
DROP INDEX IF EXISTS iraq_districts_gov_folded_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS iraq_districts_gov_identity_key
    ON iraq_districts (governorate_code, iraq_district_identity_key(name_ar));
