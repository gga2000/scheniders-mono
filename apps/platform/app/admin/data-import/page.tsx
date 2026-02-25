"use client";

import { useDataImporter } from "@/hooks/use-data-importer";
import { FileUploadStep } from "@/components/admin/data-import/file-upload-step";
import { ColumnMappingStep } from "@/components/admin/data-import/column-mapping-step";
import { ReviewStep } from "@/components/admin/data-import/review-step";
import { ExportStep } from "@/components/admin/data-import/export-step";
import { Database, ArrowRight, Upload, ListChecks, Download } from "lucide-react";

export default function DataImportPage() {
    const importer = useDataImporter();

    const {
        currentStep,
        setCurrentStep,
        headers,
        backupHeaders,
        mapping,
        setMapping,
        backupMapping,
        setBackupMapping,
        cleanedData,
        processData
    } = importer;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#0a0f1c] pb-24">
            {/* Header */}
            <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center">
                            <Database className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="font-bold text-lg leading-tight">Data Cleanup & Export Tool</h1>
                            <p className="text-xs text-slate-500 font-medium">Safe Offline Processing</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
                {/* Progress Stepper */}
                <div className="mb-12 max-w-4xl mx-auto">
                    <div className="flex items-center justify-between relative">
                        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-slate-200 dark:bg-slate-800 rounded-full z-0" />
                        <div
                            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-blue-500 rounded-full z-0 transition-all duration-500"
                            style={{
                                width: currentStep === 'upload' ? '0%' :
                                    currentStep === 'map' ? '33%' :
                                        currentStep === 'review' ? '66%' : '100%'
                            }}
                        />

                        <StepIndicator active={true} completed={currentStep !== 'upload'} icon={<Upload className="w-5 h-5" />} label="Upload" />
                        <StepIndicator active={currentStep === 'map' || currentStep === 'review' || currentStep === 'export'} completed={currentStep === 'review' || currentStep === 'export'} icon={<ListChecks className="w-5 h-5" />} label="Map Columns" />
                        <StepIndicator active={currentStep === 'review' || currentStep === 'export'} completed={currentStep === 'export'} icon={<Database className="w-5 h-5" />} label="Review & Clean" />
                        <StepIndicator active={currentStep === 'export'} completed={false} icon={<Download className="w-5 h-5" />} label="Export" />
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="transition-all">
                    {currentStep === 'upload' && (
                        <FileUploadStep
                            hasPrimary={importer.primaryData.length > 0}
                            hasBackup={importer.backupData.length > 0}
                            onPrimaryUpload={importer.handlePrimaryUpload}
                            onBackupUpload={importer.handleBackupUpload}
                            onNext={() => setCurrentStep('map')}
                        />
                    )}

                    {currentStep === 'map' && (
                        <ColumnMappingStep
                            headers={headers}
                            backupHeaders={backupHeaders}
                            mapping={mapping}
                            setMapping={setMapping}
                            backupMapping={backupMapping}
                            setBackupMapping={setBackupMapping}
                            onBack={() => setCurrentStep('upload')}
                            onNext={() => { processData(); }}
                        />
                    )}

                    {currentStep === 'review' && (
                        <ReviewStep
                            data={cleanedData}
                            onUpdateRecord={importer.updateRecord}
                            onBack={() => setCurrentStep('map')}
                            onNext={() => setCurrentStep('export')}
                        />
                    )}

                    {currentStep === 'export' && (
                        <ExportStep
                            data={cleanedData}
                            onReset={importer.reset}
                        />
                    )}
                </div>
            </main>
        </div>
    );
}

function StepIndicator({ active, completed, icon, label }: { active: boolean, completed: boolean, icon: React.ReactNode, label: string }) {
    return (
        <div className="relative z-10 flex flex-col items-center gap-2">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 transition-colors duration-300
                ${completed ? "bg-blue-600 border-blue-600 text-white" :
                    active ? "bg-white dark:bg-slate-900 border-blue-600 text-blue-600" :
                        "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400"}`}>
                {icon}
            </div>
            <span className={`text-sm font-bold ${active ? "text-slate-900 dark:text-white" : "text-slate-400"}`}>{label}</span>
        </div>
    );
}
