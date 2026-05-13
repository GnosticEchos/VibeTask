import { prisma } from '../auth/prisma.js';

const ENSURE_WEBSOCKET_TRIGGERS_SQL = `
DROP TRIGGER IF EXISTS task_change_notify ON "Task";
DROP TRIGGER IF EXISTS column_change_notify ON "ProjectColumn";
DROP TRIGGER IF EXISTS member_change_notify ON "ProjectUser";
DROP TRIGGER IF EXISTS project_change_notify ON "Project";

CREATE OR REPLACE FUNCTION public.notify_change()
RETURNS trigger AS $$
DECLARE
    payload json;
    channel_name text;
    project_id integer;
    row_data jsonb;
BEGIN
    IF TG_OP = 'DELETE' THEN
        row_data := to_jsonb(OLD);
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
        row_data := to_jsonb(NEW);
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

    channel_name := CASE TG_TABLE_NAME
        WHEN 'Task' THEN 'db:task:change'
        WHEN 'ProjectColumn' THEN 'db:column:change'
        WHEN 'ProjectUser' THEN 'db:member:change'
        WHEN 'Project' THEN 'db:project:change'
        ELSE 'db:change'
    END;

    PERFORM pg_notify(channel_name, payload::text);
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER task_change_notify
AFTER INSERT OR UPDATE OR DELETE ON "Task"
FOR EACH ROW EXECUTE FUNCTION public.notify_change();

CREATE TRIGGER column_change_notify
AFTER INSERT OR UPDATE OR DELETE ON "ProjectColumn"
FOR EACH ROW EXECUTE FUNCTION public.notify_change();

CREATE TRIGGER member_change_notify
AFTER INSERT OR UPDATE OR DELETE ON "ProjectUser"
FOR EACH ROW EXECUTE FUNCTION public.notify_change();

CREATE TRIGGER project_change_notify
AFTER INSERT OR UPDATE OR DELETE ON "Project"
FOR EACH ROW EXECUTE FUNCTION public.notify_change();
`;

export async function ensureWebsocketTriggers(): Promise<void> {
  await prisma.$executeRawUnsafe(ENSURE_WEBSOCKET_TRIGGERS_SQL);
  console.log('[PG-LISTEN] WebSocket triggers verified');
}

