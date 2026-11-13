
document.addEventListener("DOMContentLoaded", async function () {
    const container = document.getElementById("home-jobs-container");

    if (!container) return;

    const supabase = window.supabaseClient;

    if (!supabase) {
        container.innerHTML = "<p>Unable to load jobs right now.</p>";
        console.error("NaijaJobs Supabase client was not found.");
        return;
    }

    try {
        const now = new Date().toISOString();

        let { data: jobs, error } = await supabase
            .from("jobs")
            .select("id, title, category, location, state, city, budget, job_type, featured_until")
            .eq("status", "open")
            .is("archived_at", null)
            .or(`featured_until.is.null,featured_until.lte.${now}`)
            .order("created_at", { ascending: false })
            .limit(3);

        if (error) throw error;

        if (!jobs || jobs.length === 0) {
            container.innerHTML = "<p>No new opportunities are available right now. Please check again soon.</p>";
            return;
        }

        container.innerHTML = jobs.map(job => {
            const location = [job.city, job.state, job.location]
                .filter(Boolean)
                .join(", ");

            const budget = job.budget
                ? `₦${Number(job.budget).toLocaleString("en-NG")}`
                : "Budget not specified";

            return `
                <article class="home-job-card">
                    <div>
                        <h3>${escapeHomeHTML(job.title)}</h3>
                        <p>${escapeHomeHTML(job.category || "General")}</p>
                        <p>${escapeHomeHTML(location || "Location not specified")}</p>
                    </div>
                    <div>
                        <strong>${escapeHomeHTML(budget)}</strong>
                        <a href="job.html?id=${encodeURIComponent(job.id)}">View Job</a>
                    </div>
                </article>
            `;
        }).join("");

    } catch (error) {
        console.error("Homepage jobs error:", error);
        container.innerHTML = "<p>We couldn't load opportunities right now. Please try again later.</p>";
    }
});

function escapeHomeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}
