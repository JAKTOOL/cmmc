import * as Framework from "@/api/entities/Framework";
import { Footer } from "@/app/components/footer";
import { Main } from "@/app/components/main";
import { Navigation } from "@/app/components/navigation";
import { Requirements } from "@/app/components/requirements";
import ManifestComponent from "@/app/context/manifest";
import { RevisionV2Component } from "@/app/context/revision";
import type { Metadata, ResolvingMetadata } from "next";

export async function generateStaticParams() {
    const manifest = await Framework.manifest;
    const families = manifest.families.elements;

    return families.map((family) => ({
        family_id: family.element_identifier,
    }));
}

type Props = {
    params: Promise<{ family_id: string }>;
};

export async function generateMetadata(
    { params }: Props,
    parent: ResolvingMetadata,
): Promise<Metadata> {
    const { family_id } = await params;

    return {
        title: `Family ${family_id} | CMMC | SP NIST 800-171 Rev 2`,
        description: `SP NIST 800-171 family ${family_id}`,
        creator: "NIST",
        publisher: "NIST",
        keywords: ["CMMC", family_id],
        applicationName: "CMMC",
    };
}

export default async function Page({ params }) {
    const { family_id } = await params;
    return (
        <ManifestComponent>
            <RevisionV2Component>
                <Navigation />
                <Main>
                    <Requirements familyId={family_id} />
                </Main>
                <Footer />
            </RevisionV2Component>
        </ManifestComponent>
    );
}
