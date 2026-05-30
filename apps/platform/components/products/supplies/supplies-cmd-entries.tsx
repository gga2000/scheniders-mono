// Registration stub — wire into the global palette once its API supports extensions.

export interface SuppliesCommand {
    id: string;
    label: string;
    hint?: string;
    action: () => void;
}

export const SUPPLIES_COMMANDS: SuppliesCommand[] = [];
