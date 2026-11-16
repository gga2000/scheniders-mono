import { describe, it, expect } from "vitest";
import { findSpike, fold, type SpikeMessage } from "./support-spike";

const msg = (tenant_id: string, body: string, errorCode?: string): SpikeMessage => ({
  tenant_id,
  body,
  context: errorCode ? { errorCode } : {},
});

describe("fold", () => {
  it("meets the spellings merchants mix", () => {
    expect(fold("المحفظة")).toBe("المحفظه");
    expect(fold("إضافة")).toBe(fold("اضافه"));
    expect(fold("Prime")).toBe("prime");
  });
});

describe("findSpike", () => {
  it("finds three shops writing about delivery", () => {
    const spike = findSpike([
      msg("s1", "برايم ما اخذ الطلب"),
      msg("s2", "المندوب ما اجه"),
      msg("s3", "التوصيل متأخر اليوم"),
    ]);
    expect(spike).toMatchObject({ topic: "delivery", shops: 3 });
    expect(spike?.label).toBe("3 shops wrote about delivery in the last 30 min");
    expect(spike?.notice).toContain("التوصيل");
  });

  it("counts shops, not messages", () => {
    expect(
      findSpike([msg("s1", "برايم"), msg("s1", "برايم مرة ثانية"), msg("s1", "برايم!"), msg("s2", "برايم")]),
    ).toBeNull();
  });

  it("does not read a wallet top-up as delivery", () => {
    const spike = findSpike([msg("s1", "شحن المحفظة ما صار"), msg("s2", "شحنت الرصيد"), msg("s3", "دفعت وما نزل")]);
    expect(spike?.topic).toBe("wallet");
  });

  it("finds the same error seen by several shops", () => {
    const spike = findSpike([msg("s1", "خطأ", "orders.load"), msg("s2", "ليش", "orders.load"), msg("s3", "؟", "orders.load")]);
    expect(spike).toMatchObject({ topic: "error:orders.load", shops: 3 });
    expect(spike?.label).toContain("the same error (orders.load)");
  });

  it("picks the topic with the most shops", () => {
    const spike = findSpike([
      msg("s1", "واتساب"),
      msg("s2", "واتساب"),
      msg("s3", "واتساب"),
      msg("s1", "برايم"),
      msg("s2", "برايم"),
      msg("s3", "برايم"),
      msg("s4", "برايم"),
    ]);
    expect(spike).toMatchObject({ topic: "delivery", shops: 4 });
  });

  it("stays quiet below the bar", () => {
    expect(findSpike([msg("s1", "برايم"), msg("s2", "برايم"), msg("s3", "شلونكم")])).toBeNull();
    expect(findSpike([])).toBeNull();
  });
});
