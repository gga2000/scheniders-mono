// =============================================
// RE-EXPORTS FROM CENTRALIZED TYPES
// All types that were previously defined here are now in @/types/customer
// These re-exports maintain backward compatibility.
// =============================================
export type {
    TagColor,
    CustomerStatus,
    CustomerTag,
    CustomerNote,
    CustomerMetadata,
    CustomerTagAssignment,
} from '@/types/customer';

export { tagColorClasses } from '@/types/customer';
