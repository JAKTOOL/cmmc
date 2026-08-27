// Window-event contract between the draft panel and the description
// textareas in form_elements.tsx. An event (rather than props) because the
// panel and the form fields are distant cousins in the tree — same idiom as
// TABLE_CHANGED_EVENT.

export const LLM_DRAFT_INSERT_EVENT = "llm-draft-insert";

export interface DraftInsertDetail {
    /** Form field key, e.g. "03.01.01.a.description". */
    key: string;
    text: string;
    mode: "append" | "replace";
}

export const dispatchDraftInsert = (detail: DraftInsertDetail): void => {
    window.dispatchEvent(
        new CustomEvent(LLM_DRAFT_INSERT_EVENT, { detail }),
    );
};
