import { Convert, Elements } from "@/api/generated/Elements";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const read =  async (path: string) => {
    const data = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/data/sp_800_171_3_0_0/elements/${path}`);
    const elements: Elements = Convert.toElements(await data.text())
    return elements;
}
