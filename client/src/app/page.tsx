import { Families } from "@/app/components/families";
import { Main } from "@/app/components/main";
import { Navigation } from "@/app/components/navigation";
import ManifestComponent from "@/app/context";

export default async function Page() {
    return (
        <ManifestComponent>
            <Navigation />
            <Main>
                <Families />
            </Main>
        </ManifestComponent>
    );
}
``;
