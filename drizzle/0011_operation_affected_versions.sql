-- Track every version touched by one queued mutation, including sibling positions and removed relations.
-- The initial version remains the replay precondition; only changes caused by this transaction can be rebased.
CREATE OR REPLACE FUNCTION todoi_increment_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  touched jsonb;
  resource text;
  initial_version integer;
BEGIN
  NEW.version := OLD.version + 1;
  touched := nullif(current_setting('todoi.sync_versions', true), '')::jsonb;
  IF touched IS NOT NULL THEN
    resource := replace(TG_TABLE_NAME, '_', '-') || '/' || NEW.id;
    initial_version := coalesce((touched -> resource ->> 'before')::integer, OLD.version);
    touched := jsonb_set(touched, ARRAY[resource], jsonb_build_object('before', initial_version, 'after', NEW.version), true);
    PERFORM set_config('todoi.sync_versions', touched::text, true);
  END IF;
  RETURN NEW;
END;
$$;
