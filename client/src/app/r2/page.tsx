import { Families } from "@/app/components/families";
import { Footer } from "@/app/components/footer";
import { Main } from "@/app/components/main";
import { Navigation } from "@/app/components/navigation";
import ManifestComponent from "@/app/context/manifest";
import RevisionComponent, { Revision } from "@/app/context/revision";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: "Families | CMMC | SP NIST 800-171 Rev 2",
        description: "Families for SP NIST 800-171 Rev 2",
    };
}

export default async function Page() {
    return (
        <ManifestComponent>
            <RevisionComponent value={Revision.V2}>
                <Navigation />
                <Main>
                    <Families />
                </Main>
                <Footer />
            </RevisionComponent>
        </ManifestComponent>
    );
}
