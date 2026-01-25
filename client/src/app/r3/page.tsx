import { Families } from "@/app/components/families";
import { Footer } from "@/app/components/footer";
import { Main } from "@/app/components/main";
import { Navigation } from "@/app/components/navigation";
import ManifestComponent from "@/app/context/manifest";
import RevisionComponent from "@/app/context/revision";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: "Families | CMMC | SP NIST 800-171 Rev 3",
        description: "Families for SP NIST 800-171 Rev 3",
    };
}

export default async function Page() {
    return (
        <ManifestComponent>
            <RevisionComponent>
                <Navigation />
                <Main>
                    <Families />
                </Main>
                <Footer />
            </RevisionComponent>
        </ManifestComponent>
    );
}
