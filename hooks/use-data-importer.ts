import { useState } from 'react';
import * as xlsx from 'xlsx';
import { cleanImportedPhone, mergeBackupIds, parseRawAddress } from '@/lib/data-cleaner';

export type ImportStep = 'upload' | 'map' | 'review' | 'export';

export type ColumnMapping = {
    customerName: string;
    phone: string;
    address: string;    // raw address column
    orderId?: string;   // optional primary order id
    notes?: string;
    products?: string;  // things they ordered
};

export type CleanedRecord = {
    _id: string; // internal id for UI
    customer_name: string;
    phone: string;
    secondary_phone: string;
    city: string;
    governorate_code: string;
    address_details: string;
    order_id: string;
    needs_review: boolean;
    review_reasons: string[];
    raw_reference: any; // keep original data
};

export function useDataImporter() {
    const [currentStep, setCurrentStep] = useState<ImportStep>('upload');

    // File State
    const [primaryData, setPrimaryData] = useState<any[]>([]);
    const [backupData, setBackupData] = useState<any[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [backupHeaders, setBackupHeaders] = useState<string[]>([]);

    // Mapping State
    const [mapping, setMapping] = useState<Partial<ColumnMapping>>({});
    const [backupMapping, setBackupMapping] = useState<{ matchKey: string, targetKey: string }>({ matchKey: '', targetKey: '' });

    // Cleaned State
    const [cleanedData, setCleanedData] = useState<CleanedRecord[]>([]);

    const parseFile = async (file: File): Promise<{ data: any[], headers: string[] }> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    const workbook = xlsx.read(data, { type: 'binary' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const json = xlsx.utils.sheet_to_json(worksheet);

                    if (json.length > 0) {
                        const fileHeaders = Object.keys(json[0] as object);
                        resolve({ data: json, headers: fileHeaders });
                    } else {
                        resolve({ data: [], headers: [] });
                    }
                } catch (err) {
                    reject(err);
                }
            };
            reader.readAsBinaryString(file);
        });
    };

    const handlePrimaryUpload = async (file: File) => {
        const { data, headers } = await parseFile(file);
        setPrimaryData(data);
        setHeaders(headers);
    };

    const handleBackupUpload = async (file: File) => {
        const { data, headers } = await parseFile(file);
        setBackupData(data);
        setBackupHeaders(headers);
    };

    const processData = () => {
        if (!mapping.customerName || !mapping.phone) return;

        let workingData = [...primaryData];

        // 1. Merge Backup Data if applicable
        if (backupData.length > 0 && backupMapping.matchKey && backupMapping.targetKey && mapping.orderId) {
            const { merged } = mergeBackupIds(workingData, backupData, {
                primary: mapping.phone, // usually match by phone
                backup: backupMapping.matchKey,
                target: mapping.orderId,
                backupTarget: backupMapping.targetKey
            });
            workingData = merged;
        }

        // 2. Clean and Structural Parse
        const processed: CleanedRecord[] = workingData.map((row, index) => {
            const reasons: string[] = [];

            // Phones
            const rawPhone = row[mapping.phone || ''];
            const phoneRes = cleanImportedPhone(rawPhone);
            if (!phoneRes.isValid) reasons.push('Invalid Phone Number');

            // Address
            const rawAddress = row[mapping.address || ''];
            const addressRes = parseRawAddress(rawAddress);
            if (addressRes.status === 'needs_review') reasons.push('Could not auto-parse address');

            // Order ID
            const orderId = mapping.orderId ? row[mapping.orderId] : '';
            if (!orderId) reasons.push('Missing Order ID');

            return {
                _id: String(index),
                customer_name: String(row[mapping.customerName || ''] || ''),
                phone: phoneRes.clean,
                secondary_phone: '',
                city: addressRes.city,
                governorate_code: addressRes.governorate_code,
                address_details: addressRes.address_details,
                order_id: String(orderId || ''),
                needs_review: reasons.length > 0,
                review_reasons: reasons,
                raw_reference: row
            };
        });

        setCleanedData(processed);
        setCurrentStep('review');
    };

    const updateRecord = (id: string, updates: Partial<CleanedRecord>) => {
        setCleanedData(prev => prev.map(r => r._id === id ? { ...r, ...updates } : r));
    };

    const reset = () => {
        setCurrentStep('upload');
        setPrimaryData([]);
        setBackupData([]);
        setCleanedData([]);
        setMapping({});
    };

    return {
        currentStep,
        setCurrentStep,
        primaryData,
        backupData,
        headers,
        backupHeaders,
        mapping,
        setMapping,
        backupMapping,
        setBackupMapping,
        cleanedData,
        handlePrimaryUpload,
        handleBackupUpload,
        processData,
        updateRecord,
        reset
    };
}
