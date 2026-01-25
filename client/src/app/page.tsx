import { Families } from "@/app/components/families";
import { Footer } from "@/app/components/footer";
import { Main } from "@/app/components/main";
import { Navigation } from "@/app/components/navigation";
import ManifestComponent from "@/app/context/manifest";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: "CMMC | SP NIST 800-171 Rev 3",
        description:
            "This application simplifies achieving NIST SP 800-171 Revision 3 compliance by providing a user-friendly interface to manage security controls, store data locally, and generate compliance summaries. ",
    };
}

export default async function Page() {
    return (
        <ManifestComponent>
            <Navigation />
            <Main>
                <Families />
            </Main>
            <Footer />
        </ManifestComponent>
    );
}
