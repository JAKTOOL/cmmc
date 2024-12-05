import * as Framework from "@/api/entities/Framework";
import { Requirements } from "@/app/components/requirements";
import ManifestComponent from "@/app/context";

export async function generateStaticParams() {
    const manifest = await Framework.Manifest.init();
    const families = manifest.families.elements;

    return families.map((family) => ({
        family_id: family.element_identifier,
    }));
}

export default async function Page({ params }) {
    const { family_id } = await params;
    return (
        <ManifestComponent>
            <Requirements familyId={family_id} />
        </ManifestComponent>
    );
}
