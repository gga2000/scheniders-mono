import { toast } from '@/hooks/use-toast';

// Copy helper
export const copyToClipboard = (text: string, label: string, t: (key: string, vars?: Record<string, string | number>) => string) => {
    navigator.clipboard.writeText(text).then(() => {
        toast.success(t("orders.toast.copied", { label }));
    }).catch(() => {
        toast.error(t("orders.toast.copyFailed"));
    });
};
