import * as Framework from "@/api/entities/Framework";
import { Main } from "@/app/components/main";
import { Navigation } from "@/app/components/navigation";
import { Footer } from "@/app/components/footer";
import { SecurityRequirements } from "@/app/components/security_requirements";
import ManifestComponent from "@/app/context";

export async function generateStaticParams() {
    const manifest = await Framework.Manifest.init();
    const requirements = manifest.requirements.elements;

    return requirements.map((requirement) => ({
        requirement_id: requirement.element_identifier,
    }));
}

export default async function Page({ params }) {
    const { requirement_id } = await params;

    return (
        <ManifestComponent>
            <Navigation />
            <Main>
                <SecurityRequirements requirementId={requirement_id} />
            </Main>
            <Footer />
        </ManifestComponent>
    );
}
