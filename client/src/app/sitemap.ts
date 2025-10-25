import * as Framework from "@/api/entities/Framework";
import type { MetadataRoute } from "next";
export const dynamic = "force-static";
const URL = "https://cmmc.jaktool.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const manifest = await Framework.Manifest.init();

    return [
        {
            url: URL,
            lastModified: new Date().toISOString(),
            priority: 1,
        },
        {
            url: `${URL}/r3`,
            lastModified: new Date().toISOString(),
            priority: 1,
        },
        ...manifest.families.elements.map((element) => ({
            url: `${URL}/r3/family/${element.element_identifier}`,
            lastModified: new Date().toISOString(),
            priority: 0.9,
        })),
        ...manifest.requirements.elements.map((element) => ({
            url: `${URL}/r3/requirement/${element.element_identifier}`,
            lastModified: new Date().toISOString(),
            priority: 0.7,
        })),
    ];
}
