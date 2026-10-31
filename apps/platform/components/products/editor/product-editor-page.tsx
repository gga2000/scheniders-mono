"use client";

import { useProductEditor } from "@/hooks/use-product-editor";
import type { Product } from "@/types/product";
import { ProductEditorHeader } from "./product-editor-header";
import { ProductEditorSidebar } from "./product-editor-sidebar";
import { ProductBasicSection } from "./product-basic-section";
import { ProductPricingSection } from "./product-pricing-section";
import { ProductInventorySection } from "./product-inventory-section";
import { ProductMediaSection } from "./product-media-section";
import { ProductStorefrontSection } from "./product-storefront-section";
import { ProductAttributesSection } from "./product-attributes-section";
import { VariantOptionsBuilder } from "./variant-options-builder";
import { VariantMatrixTable } from "./variant-matrix-table";
import type { VariantRowData } from "./variant-matrix-table";
import { VariantChangesDialog } from "./variant-changes-dialog";
import { ProductTypeSelector } from "./product-type-selector";
import { PhysicalFieldsSection } from "./physical-fields-section";
import { DigitalFieldsSection } from "./digital-fields-section";
import { ServiceFieldsSection } from "./service-fields-section";
import { BundleBuilderSection } from "./bundle-builder-section";
import { TieredPricingSection } from "./tiered-pricing-section";
import { OrderBumpsSection } from "./order-bumps-section";
import { RelatedProductsSection } from "./related-products-section";
import { ProductCMSTabs } from "./product-cms-tabs";
import { InventoryTimeline } from "./inventory-timeline";
import { ReorderAlertsSection } from "./reorder-alerts-section";
import { SupplierSection } from "./supplier-section";
import { PriceHistoryChart } from "./price-history-chart";
import { ActivityLogSection } from "./activity-log-section";
import { StorefrontPreview } from "./storefront-preview";
import { CollapsibleSection } from "./collapsible-section";
import { AdvancedOptionsSection } from "./advanced-options-section";
import { LandedCostSection } from "./landed-cost-section";
import { RecipeSection } from "./recipe-section";
import { TagInput } from "../tags/tag-input";
import { AnimatePresence, motion } from "framer-motion";
import { TrendingUp, Clock, Package, Zap, Link as LinkIcon, Weight, Truck, Barcode, MapPin, Layers3, Tags } from "lucide-react";
import { SectionNav } from "./section-nav";
import { AutoSaveIndicator } from "./auto-save-indicator";
import { useLanguage } from "@/hooks/use-language";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";
import dynamic from "next/dynamic";

// Collapsed-by-default sections: their code (jsbarcode, qrcode, batch and
// location tooling) loads when the section is opened, not with the editor.
const BarcodeGenerator = dynamic(() => import("../barcode/barcode-generator").then((m) => m.BarcodeGenerator));
const BatchManager = dynamic(() => import("../batch-tracking/batch-manager").then((m) => m.BatchManager));
const ProductLocationPicker = dynamic(() => import("../warehouse/product-location-picker").then((m) => m.ProductLocationPicker));

interface ProductEditorPageProps {
    product?: Product | null;
    mode: "create" | "edit";
    /** Create mode: start as an internal supply (Supplies tab → Add). */
    defaultIsSupply?: boolean;
}

export function ProductEditorPage({ product, mode, defaultIsSupply = false }: ProductEditorPageProps) {
    const editor = useProductEditor({ product, mode, defaultIsSupply });
    const { t } = useLanguage();
    const { can } = usePermission();
    // Product cost and margin are for admins only (products.manage). A supply's
    // cost is its price, so whoever adds supplies keeps seeing it.
    const showCost = can(PERMISSIONS.MANAGE_PRODUCTS) || editor.formData.is_supply;

    return (
        <div className="min-h-screen bg-[var(--background)]">
            <ProductEditorHeader
                productName={editor.formData.name}
                mode={mode}
                isDirty={editor.isDirty}
                saving={editor.saving}
                status={editor.formData.status}
                onSave={() => { editor.save(); }}
                onDiscard={editor.discard}
                onDuplicate={mode === "edit" ? editor.duplicateProduct : undefined}
            >
                {mode === "edit" && (
                    <AutoSaveIndicator
                        isDirty={editor.isDirty}
                        saving={editor.saving}
                        onSave={() => { editor.save(); }}
                    />
                )}
            </ProductEditorHeader>

            {/* Draft recovery banner */}
            <AnimatePresence>
                {editor.hasDraft && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="max-w-7xl mx-auto px-6"
                    >
                        <div className="mt-4 p-4 bg-[var(--pastel-blue)] rounded-xl flex items-center justify-between">
                            <p className="text-sm text-blue-800">
                                {t("products.ed.draftFound")}
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={editor.dismissDraft}
                                    className="px-3 py-1.5 text-sm text-blue-700 hover:text-blue-900 transition-colors"
                                >
                                    {t("products.ed.dismiss")}
                                </button>
                                <button
                                    onClick={editor.handleRestoreDraft}
                                    className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                                >
                                    {t("products.ed.restoreDraft")}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Three-column layout: Nav | Content | Sidebar */}
            <div className="max-w-7xl mx-auto px-6 py-8">
                <div className="flex flex-col lg:flex-row gap-8">
                    {/* Section Navigation (desktop vertical + mobile horizontal) */}
                    <SectionNav
                        visibleSections={[
                            "type",
                            "basic",
                            "media",
                            "pricing",
                            ...(editor.formData.product_type === "physical" && !editor.formData.is_supply ? ["variants"] : []),
                            "storefront",
                            ...(mode === "edit" ? ["tags"] : []),
                            ...(editor.formData.product_type !== "digital" && editor.formData.product_type !== "service" ? ["inventory"] : []),
                            "cms",
                            ...(!editor.formData.is_supply ? ["preview"] : []),
                            "advanced",
                        ]}
                    />

                    {/* Main content */}
                    <div className="flex-1 min-w-0 space-y-6">
                        {/* === CORE SECTIONS === */}
                        <div id="section-type">
                            <ProductTypeSelector
                                value={editor.formData.product_type}
                                onChange={(type) => editor.updateField("product_type", type)}
                                mode={mode}
                            />
                        </div>

                        <div id="section-basic">
                            <ProductBasicSection
                                formData={editor.formData}
                                updateField={editor.updateField}
                            />
                        </div>

                        <div id="section-media">
                            <ProductMediaSection
                                formData={editor.formData}
                                updateField={editor.updateField}
                                productId={product?.id}
                            />
                        </div>

                        <div id="section-pricing">
                            <ProductPricingSection
                                formData={editor.formData}
                                updateField={editor.updateField}
                                profitMargin={editor.profitMargin}
                                profitAmount={editor.profitAmount}
                                discountPercentage={editor.discountPercentage}
                                showCost={showCost}
                            />
                            {showCost && (
                            <LandedCostSection
                                costBreakdown={editor.formData.cost_breakdown_json}
                                onCostBreakdownChange={(breakdown) => editor.updateField("cost_breakdown_json", breakdown)}
                                onCostChange={(cost) => editor.updateField("cost", cost)}
                                price={editor.formData.price}
                            />
                            )}
                        </div>

                        {/* Type-specific fields */}
                        {editor.formData.product_type === "digital" && (
                            <DigitalFieldsSection
                                formData={editor.formData}
                                updateField={editor.updateField}
                                productId={product?.id}
                            />
                        )}

                        {editor.formData.product_type === "service" && (
                            <ServiceFieldsSection
                                formData={editor.formData}
                                updateField={editor.updateField}
                            />
                        )}

                        {editor.formData.product_type === "bundle" && (
                            <BundleBuilderSection
                                formData={editor.formData}
                                updateField={editor.updateField}
                                currentProductId={product?.id}
                            />
                        )}

                        {/* === VARIANTS === */}
                        {!editor.formData.is_supply && editor.formData.product_type === "physical" && (
                            <div id="section-variants" className="space-y-4">
                                <VariantOptionsBuilder
                                    options={editor.formData.variant_options}
                                    onChange={editor.updateVariantOptions}
                                />
                                {editor.formData.variants.length > 0 && (
                                    <VariantMatrixTable
                                        variants={editor.formData.variants as VariantRowData[]}
                                        options={editor.formData.variant_options.filter(o => o.name.trim() && o.values.length > 0)}
                                        onUpdateVariant={editor.updateVariantRow}
                                        onBulkUpdateVariants={editor.bulkUpdateVariants}
                                        onApplyToAll={editor.applyToAllVariants}
                                        onDeleteVariants={editor.deleteVariants}
                                        productSku={editor.formData.sku}
                                        productPrice={editor.formData.price}
                                        productCost={editor.formData.cost}
                                        showCost={showCost}
                                    />
                                )}
                                {editor.pendingVariantDiff && (
                                    <VariantChangesDialog
                                        diff={editor.pendingVariantDiff}
                                        onConfirm={editor.confirmVariantChanges}
                                        onCancel={editor.cancelVariantChanges}
                                    />
                                )}
                            </div>
                        )}

                        {/* === STOREFRONT & INVENTORY === */}
                        <div id="section-storefront">
                            <ProductStorefrontSection
                                formData={editor.formData}
                                updateField={editor.updateField}
                                autoGenerateSlug={editor.autoGenerateSlug}
                            />
                        </div>

                        {/* === ATTRIBUTES === */}
                        {mode === "edit" && product?.id && !editor.formData.is_supply && (
                            <div id="section-attributes">
                                <ProductAttributesSection productId={product.id} />
                            </div>
                        )}

                        {/* === TAGS === */}
                        {mode === "edit" && product?.id && (
                            <div id="section-tags">
                                <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Tags className="w-4 h-4 text-muted" />
                                        <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">Tags</h3>
                                    </div>
                                    <TagInput productId={product.id} />
                                </div>
                            </div>
                        )}

                        {editor.formData.product_type !== "digital" && editor.formData.product_type !== "service" && (
                            <div id="section-inventory" className="space-y-6">
                                <ProductInventorySection
                                    formData={editor.formData}
                                    updateField={editor.updateField}
                                    reservedQuantity={product?.reserved_quantity}
                                />
                                <ReorderAlertsSection
                                    formData={editor.formData}
                                    updateField={editor.updateField}
                                />
                                {!editor.formData.is_supply && (
                                    <RecipeSection
                                        productId={product?.id ?? null}
                                        productName={editor.formData.name}
                                    />
                                )}
                            </div>
                        )}

                        {/* === CMS TABS === */}
                        <div id="section-cms">
                        <ProductCMSTabs
                            noteCards={editor.formData.feature_cards}
                            onNoteCardsChange={(noteCards) => editor.updateField("feature_cards", noteCards)}
                            productId={product?.id}
                        />
                        </div>

                        {/* === STOREFRONT PREVIEW === */}
                        {!editor.formData.is_supply && (
                            <div id="section-preview">
                            <StorefrontPreview
                                name={editor.formData.name}
                                description={editor.formData.description}
                                shortDescription={editor.formData.short_description}
                                price={editor.formData.price}
                                compareAtPrice={editor.formData.compare_at_price}
                                imageUrl={editor.formData.image_url}
                                slug={editor.formData.slug}
                                variantOptions={editor.formData.variant_options.filter(o => o.name.trim() && o.values.length > 0)}
                            />
                            </div>
                        )}

                        {/* === ADVANCED OPTIONS (all collapsible, grouped together) === */}
                        <div id="section-advanced">
                        <AdvancedOptionsSection>
                            {!editor.formData.is_supply && (
                                <CollapsibleSection title={t("products.ed.sec.volume")} icon={<TrendingUp className="w-4 h-4 text-muted" />} badge={editor.formData.tiered_prices.length || undefined} persistKey="volume-pricing">
                                    <TieredPricingSection
                                        tiers={editor.formData.tiered_prices}
                                        onChange={(tiers) => editor.updateField("tiered_prices", tiers)}
                                        basePrice={editor.formData.price}
                                    />
                                </CollapsibleSection>
                            )}

                            {editor.formData.product_type === "physical" && (
                                <CollapsibleSection title={t("products.ed.sec.shipping")} icon={<Weight className="w-4 h-4 text-muted" />} persistKey="shipping-dims">
                                    <PhysicalFieldsSection
                                        formData={editor.formData}
                                        updateField={editor.updateField}
                                    />
                                </CollapsibleSection>
                            )}

                            {editor.formData.product_type !== "digital" && editor.formData.product_type !== "service" && (
                                <>
                                    <CollapsibleSection title={t("products.ed.sec.invHistory")} icon={<Clock className="w-4 h-4 text-muted" />} badge={editor.formData.inventory_history.length || undefined} persistKey="inventory-history">
                                        <InventoryTimeline
                                            entries={editor.formData.inventory_history}
                                            onChange={(entries) => editor.updateField("inventory_history", entries)}
                                        />
                                    </CollapsibleSection>

                                    <CollapsibleSection title={t("products.ed.sec.suppliers")} icon={<Truck className="w-4 h-4 text-muted" />} badge={editor.formData.suppliers.length || undefined} persistKey="suppliers">
                                        <SupplierSection
                                            suppliers={editor.formData.suppliers}
                                            onChange={(suppliers) => editor.updateField("suppliers", suppliers)}
                                            showCost={showCost}
                                        />
                                    </CollapsibleSection>
                                </>
                            )}

                            {!editor.formData.is_supply && (
                                <CollapsibleSection title={t("products.ed.sec.bumps")} icon={<Zap className="w-4 h-4 text-muted" />} badge={editor.formData.order_bumps.length || undefined} persistKey="order-bumps">
                                    <OrderBumpsSection
                                        bumps={editor.formData.order_bumps}
                                        onChange={(bumps) => editor.updateField("order_bumps", bumps)}
                                        currentProductId={product?.id}
                                    />
                                </CollapsibleSection>
                            )}

                            <CollapsibleSection title={t("products.ed.sec.related")} icon={<LinkIcon className="w-4 h-4 text-muted" />} badge={editor.formData.related_products.length || undefined} persistKey="related-products">
                                <RelatedProductsSection
                                    relatedProducts={editor.formData.related_products}
                                    onChange={(products) => editor.updateField("related_products", products)}
                                    currentProductId={product?.id}
                                />
                            </CollapsibleSection>

                            {mode === "edit" && (
                                <CollapsibleSection title={t("products.ed.sec.priceHistory")} icon={<TrendingUp className="w-4 h-4 text-muted" />} persistKey="price-history">
                                    <PriceHistoryChart
                                        entries={editor.formData.price_history}
                                        currentPrice={editor.formData.price}
                                    />
                                </CollapsibleSection>
                            )}

                            {mode === "edit" && (
                                <CollapsibleSection title={t("products.ed.sec.activity")} icon={<Clock className="w-4 h-4 text-muted" />} badge={editor.formData.activity_log.length || undefined} persistKey="activity-log">
                                    <ActivityLogSection
                                        entries={editor.formData.activity_log}
                                    />
                                </CollapsibleSection>
                            )}

                            <CollapsibleSection title={t("products.ed.sec.barcode")} icon={<Barcode className="w-4 h-4 text-muted" />} persistKey="barcode-qr">
                                <BarcodeGenerator
                                    barcode={editor.formData.barcode ?? ""}
                                    onChange={(barcode) => editor.updateField("barcode" as any, barcode)}
                                    productSku={editor.formData.sku}
                                    productSlug={editor.formData.slug}
                                />
                            </CollapsibleSection>

                            {editor.formData.product_type !== "digital" && editor.formData.product_type !== "service" && (
                                <>
                                    <CollapsibleSection title={t("products.ed.sec.batch")} icon={<Layers3 className="w-4 h-4 text-muted" />} persistKey="batch-expiry">
                                        <BatchManager
                                            productId={product?.id || ""}
                                            productName={editor.formData.name}
                                        />
                                    </CollapsibleSection>

                                    <CollapsibleSection title={t("products.ed.sec.locations")} icon={<MapPin className="w-4 h-4 text-muted" />} persistKey="storage-locations">
                                        <ProductLocationPicker
                                            productId={product?.id || ""}
                                        />
                                    </CollapsibleSection>
                                </>
                            )}
                        </AdvancedOptionsSection>
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="w-full lg:w-80 shrink-0">
                        <div className="lg:sticky lg:top-24">
                            <ProductEditorSidebar
                                formData={editor.formData}
                                updateField={editor.updateField}
                                mode={mode}
                                timesSold={product?.times_sold}
                                totalRevenue={product?.total_revenue}
                                profitMargin={showCost ? editor.profitMargin : null}
                                averageOrderValue={product?.average_order_value}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
