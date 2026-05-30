import type { ComponentType } from "react";
import type { Tenant, Product, Category } from "@/lib/types";

import SchneidersTemplate from "./schneiders/Home";
import FashionTemplate from "./fashion/Home";
import BeautyTemplate from "./beauty/Home";
import ElectronicsTemplate from "./electronics/Home";
import GeneralTemplate from "./general/Home";
import CleanTemplate from "./clean/Home";

export interface TemplateHomeProps {
  tenant: Tenant;
  products: Product[];
  categories: Category[];
}

const TEMPLATES: Record<string, ComponentType<TemplateHomeProps>> = {
  schneiders: SchneidersTemplate,
  fashion: FashionTemplate,
  beauty: BeautyTemplate,
  electronics: ElectronicsTemplate,
  general: GeneralTemplate,
  clean: CleanTemplate,
};

export function getTemplate(name?: string): ComponentType<TemplateHomeProps> {
  return TEMPLATES[name ?? "schneiders"] ?? SchneidersTemplate;
}
