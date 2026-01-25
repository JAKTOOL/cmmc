import * as Framework from "@/api/entities/Framework";
import { Footer } from "@/app/components/footer";
import { Main } from "@/app/components/main";
import { Navigation } from "@/app/components/navigation";
import { SecurityRequirements } from "@/app/components/security_requirements";
import { ManifestV3Component } from "@/app/context/manifest";
import { RevisionV3Component } from "@/app/context/revision";
import type { Metadata, ResolvingMetadata } from "next";

export async function generateStaticParams() {
    const manifest = await Framework.manifestV3;
    const requirements = manifest.requirements.elements;

    return requirements.map((requirement) => ({
        requirement_id: requirement.element_identifier,
    }));
}

type Props = {
    params: Promise<{ requirement_id: string }>;
};

export async function generateMetadata(
    { params }: Props,
    parent: ResolvingMetadata,
): Promise<Metadata> {
    const { requirement_id } = await params;
    const manifest = await Framework.manifestV3;
    const requirement = manifest.requirements.byId[requirement_id];
    return {
        title: `${requirement_id}: ${requirement.title}`,
        description: requirement.text,
        creator: "NIST",
        publisher: "NIST",
        keywords: [
            "CMMC",
            requirement_id,
            requirement.family,
            requirement.type,
        ],
        applicationName: "CMMC",
    };
}

export default async function Page({ params }) {
    const { requirement_id } = await params;

    return (
        <ManifestV3Component>
            <RevisionV3Component>
                <Navigation />
                <Main>
                    <SecurityRequirements requirementId={requirement_id} />
                </Main>
                <Footer />
            </RevisionV3Component>
        </ManifestV3Component>
    );
}
