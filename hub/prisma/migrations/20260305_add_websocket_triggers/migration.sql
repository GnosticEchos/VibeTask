-- ============================================
-- WEBSOCKET NOTIFICATION TRIGGERS
-- ============================================
-- SAFETY NOTE: This migration ONLY creates triggers that NOTIFY on changes.
-- It does NOT modify existing data, delete records, or change table schemas.
-- The triggers simply emit notifications when data changes.
-- ============================================

-- Drop existing triggers if they exist (for idempotency)
DROP TRIGGER IF EXISTS task_change_notify ON "Task";
DROP TRIGGER IF EXISTS column_change_notify ON "ProjectColumn";
DROP TRIGGER IF EXISTS member_change_notify ON "ProjectUser";
DROP TRIGGER IF EXISTS project_change_notify ON "Project";

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.notify_change();

-- ============================================
-- Trigger function for change notifications
-- ============================================
-- Use to_jsonb to properly serialize the row data
CREATE OR REPLACE FUNCTION public.notify_change()
RETURNS trigger AS $$
DECLARE
    payload json;
    channel_name text;
    project_id integer;
    row_data jsonb;
    record_ref record;
BEGIN
    -- Handle DELETE case (TG_OP = 'DELETE')
    IF TG_OP = 'DELETE' THEN
        -- Cast OLD to record and build JSON manually
        -- Use to_jsonb which handles rows correctly
        row_data := to_jsonb(OLD);
        
        -- Extract project_id based on table
        CASE TG_TABLE_NAME
            WHEN 'Task' THEN project_id := OLD."projectId";
            WHEN 'ProjectColumn' THEN project_id := OLD."projectId";
            WHEN 'ProjectUser' THEN project_id := OLD."projectId";
            WHEN 'Project' THEN project_id := OLD.id;
            ELSE project_id := NULL;
        END CASE;
        
        payload = json_build_object(
            'table', TG_TABLE_NAME,
            'action', TG_OP,
            'id', OLD.id,
            'projectId', project_id,
            'data', row_data
        );
    ELSE
        -- For INSERT and UPDATE operations, NEW contains the row data
        row_data := to_jsonb(NEW);
        
        -- Extract project_id based on table
        CASE TG_TABLE_NAME
            WHEN 'Task' THEN project_id := NEW."projectId";
            WHEN 'ProjectColumn' THEN project_id := NEW."projectId";
            WHEN 'ProjectUser' THEN project_id := NEW."projectId";
            WHEN 'Project' THEN project_id := NEW.id;
            ELSE project_id := NULL;
        END CASE;
        
        payload = json_build_object(
            'table', TG_TABLE_NAME,
            'action', TG_OP,
            'id', NEW.id,
            'projectId', project_id,
            'data', row_data
        );
    END IF;

    -- Determine channel based on table
    channel_name := CASE TG_TABLE_NAME
        WHEN 'Task' THEN 'db:task:change'
        WHEN 'ProjectColumn' THEN 'db:column:change'
        WHEN 'ProjectUser' THEN 'db:member:change'
        WHEN 'Project' THEN 'db:project:change'
        ELSE 'db:change'
    END;

    -- Emit notification
    PERFORM pg_notify(channel_name, payload::text);
    
    -- Return appropriate record
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Create triggers for each table
-- ============================================

-- Task table trigger
CREATE TRIGGER task_change_notify
AFTER INSERT OR UPDATE OR DELETE ON "Task"
FOR EACH ROW EXECUTE FUNCTION public.notify_change();

-- ProjectColumn table trigger
CREATE TRIGGER column_change_notify
AFTER INSERT OR UPDATE OR DELETE ON "ProjectColumn"
FOR EACH ROW EXECUTE FUNCTION public.notify_change();

-- ProjectUser table trigger (members)
CREATE TRIGGER member_change_notify
AFTER INSERT OR UPDATE OR DELETE ON "ProjectUser"
FOR EACH ROW EXECUTE FUNCTION public.notify_change();

-- Project table trigger
CREATE TRIGGER project_change_notify
AFTER INSERT OR UPDATE OR DELETE ON "Project"
FOR EACH ROW EXECUTE FUNCTION public.notify_change();

-- ============================================
-- ROLLBACK INSTRUCTIONS:
-- If anything goes wrong, run:
--   DROP TRIGGER IF EXISTS task_change_notify ON "Task";
--   DROP TRIGGER IF EXISTS column_change_notify ON "ProjectColumn";
--   DROP TRIGGER IF EXISTS member_change_notify ON "ProjectUser";
--   DROP TRIGGER IF EXISTS project_change_notify ON "Project";
--   DROP FUNCTION IF EXISTS public.notify_change();
-- ============================================
