"use client";
import * as Framework from "@/api/entities/Framework";
import { ManifestProvider, useManifestContext } from "./context";

const Requirements = () => {
    const manifest = useManifestContext();
    const requirements = manifest.requirements.elements;
    if (!requirements?.length) {
        return null;
    }

    return (
        <>
            <br />
            <h2>Requirements</h2>
            <ol>
                {requirements?.map((requirement) => (
                    <li key={requirement.element_identifier}>
                        <details>
                            <summary>
                                {requirement.element_identifier}{" "}
                                {requirement.title}
                            </summary>
                            <Discussions
                                requirementId={requirement.element_identifier}
                            />
                            <SecurityRequirements
                                requirementId={requirement.element_identifier}
                            />
                        </details>
                    </li>
                ))}
                <br />
            </ol>
            <br />
        </>
    );
};

const SecurityRequirements = ({ requirementId }) => {
    const manifest = useManifestContext();
    const requirements = manifest?.requirements.byRequirements[requirementId];
    if (!requirements?.length) {
        return null;
    }

    return (
        <>
            <h3>Security Requirements</h3>
            <ol>
                {requirements?.map((requirement) => (
                    <li key={requirement.element_identifier}>
                        {requirement.element_identifier} {requirement.title}
                        <p>{requirement.text}</p>
                    </li>
                ))}
                <br />
            </ol>
            <br />
        </>
    );
};

const Discussions = ({ requirementId }) => {
    const manifest = useManifestContext();
    const discussion = manifest?.discussions?.byRequirements[requirementId];
    if (!discussion?.length) {
        return null;
    }

    return (
        <>
            {discussion.map((discussion) => (
                <p key={discussion.element_identifier}>{discussion.text}</p>
            ))}
        </>
    );
};

const Families = () => {
    const manifest = useManifestContext();
    const families = manifest?.families?.elements;
    if (!families?.length) {
        return null;
    }

    return (
        <ul>
            {families.map((family) => (
                <li key={family.element_identifier}>
                    <details>
                        <summary>
                            {family.element_identifier} {family.title}
                        </summary>
                        <Requirements familyId={family.element_identifier} />
                    </details>
                </li>
            ))}
        </ul>
    );
};

export default function Page() {
    const manifest = Framework.Manifest.init();
    return (
        <ManifestProvider value={manifest}>
            <Families />
        </ManifestProvider>
    );
}
