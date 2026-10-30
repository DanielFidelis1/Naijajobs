
(() => {
    "use strict";

    const tableBody = document.getElementById("account-table-body");

    // Do nothing on pages that do not contain this table.
    if (!tableBody) return;

    const searchInput = document.getElementById("account-search");
    const typeFilter = document.getElementById("account-type-filter");
    const subscriptionFilter = document.getElementById("subscription-filter");
    const refreshButton = document.getElementById("refresh-accounts");
    const resultCount = document.getElementById("account-result-count");

    const totalAccounts = document.getElementById("total-accounts");
    const premiumAccounts = document.getElementById("premium-accounts");
    const freeAccounts = document.getElementById("free-accounts");

    let accounts = [];

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }

    function formatAccountType(type) {
        const labels = {
            client: "Client",
            worker: "Worker",
            job_seeker: "Job seeker"
        };

        return labels[type] || type || "Unknown";
    }

    function renderSummary() {
        totalAccounts.textContent = accounts.length;

        premiumAccounts.textContent = accounts.filter(
            account => account.subscription_status === "Premium"
        ).length;

        freeAccounts.textContent = accounts.filter(
            account => account.subscription_status === "Free"
        ).length;
    }

    function getFilteredAccounts() {
        const searchTerm = searchInput.value.trim().toLowerCase();
        const selectedType = typeFilter.value;
        const selectedSubscription = subscriptionFilter.value;

        return accounts.filter(account => {
            const searchableText = [
                account.full_name,
                account.username,
                account.email,
                account.account_type,
                account.plan_type
            ].join(" ").toLowerCase();

            const matchesSearch = searchableText.includes(searchTerm);

            const matchesType =
                !selectedType || account.account_type === selectedType;

            const matchesSubscription =
                !selectedSubscription ||
                account.subscription_status === selectedSubscription;

            return matchesSearch && matchesType && matchesSubscription;
        });
    }

    function renderAccounts() {
        const filteredAccounts = getFilteredAccounts();

        resultCount.textContent =
            `${filteredAccounts.length} account(s) shown`;

        if (filteredAccounts.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="account-message">
                        No accounts match your search or filters.
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = filteredAccounts.map(account => {
            const subscriptionClass =
                account.subscription_status === "Premium"
                    ? "premium"
                    : "free";

            const statusClass =
                account.is_suspended ? "suspended" : "active";

            const statusText =
                account.is_suspended ? "Suspended" : "Active";

            const planName = account.plan_type
                ? account.plan_type.replace(/_/g, " ")
                : "—";

            // Deletion stays disabled until the secure server-side
            // account cleanup has been implemented and tested.
            const canDelete =
                ["client", "worker", "job_seeker"].includes(
                    account.account_type
                );

            return `
                <tr>
                    <td>
                        <span class="account-name">
                            ${escapeHTML(account.full_name || "Unnamed account")}
                        </span>
                        <span class="account-email">
                            ${escapeHTML(account.email || "No email")}
                        </span>
                        <span class="account-email">
                            ${account.username
                                ? "@" + escapeHTML(account.username)
                                : ""}
                        </span>
                    </td>

                    <td>${escapeHTML(formatAccountType(account.account_type))}</td>

                    <td>
                        <span class="account-badge ${subscriptionClass}">
                            ${escapeHTML(account.subscription_status || "Free")}
                        </span>
                    </td>

                    <td>${escapeHTML(planName)}</td>

                    <td>${escapeHTML(formatDate(account.expires_at))}</td>

                    <td>
                        <span class="account-badge ${statusClass}">
                            ${statusText}
                        </span>
                    </td>

                    <td>
                        <button
    type="button"
    class="account-delete-button"
    ${canDelete ? "" : "disabled"}
    title="${canDelete ? "Permanently delete this account" : "Protected account"}"
    data-account-id="${escapeHTML(account.id)}"
    ${canDelete ? 'data-delete-account="true"' : ""}
>
    ${canDelete ? "Delete account" : "Protected"}
</button>
                    </td>
                </tr>
            `;
        }).join("");
    }

    async function loadAccounts() {
        refreshButton.disabled = true;
        refreshButton.textContent = "Loading…";

        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="account-message">
                    Loading accounts…
                </td>
            </tr>
        `;

        resultCount.textContent = "Loading accounts…";

        try {
            if (!window.supabaseClient) {
                throw new Error(
                    "Supabase client was not initialized. Check js/app.js."
                );
            }

            const { data, error } = await window.supabaseClient
                .rpc("admin_list_account_management");

            if (error) throw error;

            accounts = Array.isArray(data) ? data : [];

            renderSummary();
            renderAccounts();
        } catch (error) {
            console.error("Failed to load account management data:", error);

            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="account-message error">
                        Could not load accounts. Confirm you are signed in
                        as an administrator, then refresh the page.
                    </td>
                </tr>
            `;

            resultCount.textContent = "Account loading failed";
        } finally {
            refreshButton.disabled = false;
            refreshButton.textContent = "Refresh";
        }
    }

    searchInput.addEventListener("input", renderAccounts);
    typeFilter.addEventListener("change", renderAccounts);
    subscriptionFilter.addEventListener("change", renderAccounts);
    refreshButton.addEventListener("click", loadAccounts);

    
    // Handle account deletion through the secure Supabase Edge Function.
    tableBody.addEventListener("click", async (event) => {
        const button = event.target.closest(
            'button[data-delete-account="true"]'
        );

        if (!button || button.disabled) return;

        const targetId = button.dataset.accountId;

        if (!targetId) {
            alert("Could not identify the account. Refresh and try again.");
            return;
        }

        const account = accounts.find(item => item.id === targetId);

        if (!account) {
            alert("Account details could not be verified. Refresh and try again.");
            return;
        }

        const accountName = account.full_name || account.email || "this account";

        const confirmed = window.confirm(
            `PERMANENT ACCOUNT DELETION\n\n` +
            `Account: ${accountName}\n` +
            `Email: ${account.email || "Not available"}\n` +
            `Type: ${formatAccountType(account.account_type)}\n\n` +
            `This action permanently deletes the account and its associated ` +
            `account data and uploaded files. It cannot be undone.\n\n` +
            `Financial transaction records are intended to be preserved, ` +
            `with applicable user references cleared.\n\n` +
            `Do you want to continue?`
        );

        if (!confirmed) return;

        const secondConfirmation = window.confirm(
            `Final confirmation: permanently delete ${accountName}?\n\n` +
            `Only continue if you have verified this is the correct account.`
        );

        if (!secondConfirmation) return;

        button.disabled = true;
        button.textContent = "Deleting…";

        try {
            if (!window.supabaseClient) {
                throw new Error("Supabase client is unavailable. Refresh the page.");
            }

            const { data, error } = await window.supabaseClient.functions.invoke(
                "admin-delete-user",
                {
                    body: {
                        target_user_id: targetId
                    }
                }
            );

            if (error) {
                let message = error.message || "The deletion request failed.";

                // Supabase may provide the Edge Function's error response here.
                if (error.context && typeof error.context.json === "function") {
                    try {
                        const responseBody = await error.context.json();

                        if (responseBody?.error) {
                            message = responseBody.error;
                        }
                    } catch {
                        // Keep the original error message if the body is unreadable.
                    }
                }

                throw new Error(message);
            }

            // Never report success unless the function explicitly confirms it.
            if (!data || data.success !== true) {
                throw new Error(
                    data?.error ||
                    "Deletion was not confirmed. Check the deletion job before retrying."
                );
            }

            alert(
                "The server confirmed account deletion.\n\n" +
                "The account list will now refresh."
            );

            await loadAccounts();

        } catch (error) {
            console.error("Account deletion request failed:", error);

            alert(
                "Account deletion was not confirmed.\n\n" +
                (error.message || "An unexpected error occurred.") +
                "\n\nDo not repeatedly retry. Check the deletion job and its " +
                "recorded stages before attempting recovery."
            );

            button.disabled = false;
            button.textContent = "Delete account";
        }
    });

    loadAccounts();

})();

