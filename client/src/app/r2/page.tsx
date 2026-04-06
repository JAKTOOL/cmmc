import { Families } from "@/app/components/families";
import { Footer } from "@/app/components/footer";
import { Main } from "@/app/components/main";
import { Navigation } from "@/app/components/navigation";
import { ToastContainer } from "@/app/components/toast";
import { ManifestV2Component } from "@/app/context/manifest";
import { ToastNotificationProvider } from "@/app/context/notification";
import { RevisionV2Component } from "@/app/context/revision";

import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: "Families | CMMC | SP NIST 800-171 Rev 2",
        description: "Families for SP NIST 800-171 Rev 2",
    };
}

export default async function Page() {
    return (
        <ManifestV2Component>
            <RevisionV2Component>
                <ToastNotificationProvider>
                    <ToastContainer />
                    <Navigation />
                    <Main>
                        <Families />
                    </Main>
                    <Footer />
                </ToastNotificationProvider>
            </RevisionV2Component>
        </ManifestV2Component>
    );
}
