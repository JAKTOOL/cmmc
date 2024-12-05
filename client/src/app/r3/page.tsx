import { Families } from "@/app/components/families";
import ManifestComponent from "@/app/context";

export default async function Page() {
    return (
        <ManifestComponent>
            <Families />
        </ManifestComponent>
    );
}
