// ================================
// NAIJAJOBS - SUPABASE CONNECTION
// ================================

const SUPABASE_URL =
    "https://uzcyorfqkmikgpmfqqcf.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_MkiEBVs-uQpKsKNsVt2jsQ_zFwK-2Nc";


const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );
    window.supabaseClient = supabaseClient;

// Only allow same-site relative destinations after login.
function getSafeNextPath(fallback) {
    const raw = new URLSearchParams(window.location.search).get("next");
    if (!raw || raw.startsWith("//") || raw.includes("\\")) return fallback;
    try {
        const url = new URL(raw, window.location.origin);
        if (url.origin !== window.location.origin || !/^https?:$/.test(url.protocol)) return fallback;
        return url.pathname.replace(/^\//, "") + url.search + url.hash;
    } catch (_) {
        return fallback;
    }
}

// ================================
// SIGN UP
// ================================

const signupForm =
    document.getElementById("signup-form");

if (signupForm) {

    signupForm.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();

            const fullName =
                document.getElementById("full-name").value.trim();
            
            const username = 
                document.getElementById("username").value.trim();

            const email =
                document.getElementById("email").value.trim();

            const password =
                document.getElementById("password").value;

            const accountType =
                document.getElementById("account-type").value;

            const message =
                document.getElementById("signup-message");

            message.textContent = "Creating your account...";

            try {

                const {
                    data,
                    error
                } = await supabaseClient.auth.signUp({

                    email: email,
                    password: password,

                    options: {
                        data: {
                            full_name: fullName,
                            username: username,
                            account_type: accountType
                        }
                    }

                });

                if (error) {
                    console.error("Signup error:", error);
                    message.textContent = error.message;
                    return;
                }

                if (!data.user) {
                    message.textContent =
                        "Account could not be created. Please try again.";
                    return;
                }

                // Save the profile only when a session exists.
                // If email confirmation is required, the profile
                // should instead be created by a secure database trigger.

                
if (data.session) {

    message.textContent =
        "Account created successfully!";

    setTimeout(function () {
        window.location.href = "login.html";
    }, 1500);

} else {

    message.textContent =
        "Account created! Please check your email and confirm your account before logging in.";

}
            } catch (error) {

                console.error("Unexpected error:", error);

                message.textContent =
                    "Something went wrong. Please try again.";

            }

        }
    );

}


 
 // ================================
 // LOGIN WITH SUSPENSION CHECK
 // ================================

const loginForm = document.getElementById("login-form");

if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const message = document.getElementById("login-message");

        message.textContent = "Logging in...";

        try {
            
let data = null;
let error = null;

if (email.includes("@")) {
    // Existing email login
    const result = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
    });

    data = result.data;
    error = result.error;
} else {
    // Username login through the Edge Function
    const result = await supabaseClient.functions.invoke(
        "username-login",
        {
            body: {
                username: email,
                password: password
            }
        }
    );

    
    if (result.error) {
        let errorMessage = result.error.message;

        // Read the actual error returned by the Edge Function.
        try {
            const response = result.error.context;

            if (response && typeof response.json === "function") {
                const body = await response.json();

                if (body?.error) {
                    errorMessage = body.error;
                }
            }
        } catch (readError) {
            console.warn(
                "Could not read the login error response:",
                readError
            );
        }

        error = new Error(errorMessage);
    } else if (result.data?.session) {

        // Save the returned session in the browser
        const sessionResult = await supabaseClient.auth.setSession(
            result.data.session
        );

        data = sessionResult.data;
        error = sessionResult.error;
    } else {
        error = new Error(
            result.data?.error || "Invalid username or password."
        );
    }
}


            if (error) {
                console.error("Login error:", error);
                message.textContent = error.message;
                return;
            }

            if (!data.user) {
                message.textContent =
                    "Login failed. Please try again.";
                return;
            }

            // Check whether this user is an administrator.
            message.textContent = "Checking account permissions...";

            const { data: admin, error: adminError } =
                await supabaseClient
                    .from("admin_users")
                    .select("user_id")
                    .eq("user_id", data.user.id)
                    .maybeSingle();

            if (adminError) {
                console.error("Admin verification error:", adminError);
                await supabaseClient.auth.signOut();

                message.textContent =
                    "Permissions could not be verified. Please try again.";
                return;
            }

            // Check suspension for non-admin users.
            if (!admin) {
                message.textContent = "Checking account status...";

                const { data: profile, error: profileError } =
                    await supabaseClient
                        .from("profiles")
                        .select("is_suspended")
                        .eq("id", data.user.id)
                        .maybeSingle();

                if (profileError || !profile) {
                    console.error(
                        "Account status check failed:",
                        profileError
                    );

                    await supabaseClient.auth.signOut();

                    message.textContent =
                        "We couldn't verify your account status. Please try again.";
                    return;
                }

                if (profile.is_suspended === true) {
                    await supabaseClient.auth.signOut();

                    message.textContent =
                        "Your account has been suspended. Please contact NaijaJobs support.";

                    return;
                }
            }

            message.textContent = "Login successful!";

            setTimeout(function () {
                if (admin) {
                    window.location.href = "admin-dashboard.html";
                } else {
                    window.location.href = getSafeNextPath("dashboard.html");
                }
            }, 700);

        } catch (error) {
            console.error("Login error:", error);

            message.textContent =
                "Something went wrong. Please try again.";
        }
    });
}   
// ========================================
// POST A JOB
// ========================================

const postJobForm = document.getElementById("post-job-form");


const employerApprovalNotice = document.getElementById(
    "employer-approval-notice"
);

async function checkEmployerApproval() {
    if (!postJobForm) return;

    const submitButton = postJobForm.querySelector(
        'button[type="submit"]'
    );

    const message = document.getElementById(
        "post-job-message"
    );

    if (submitButton) submitButton.disabled = true;

    try {
        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser();

        if (authError || !user) {
            window.location.href = "login.html";
            return;
        }

        const { data: profile, error: profileError } =
            await supabaseClient
                .from("profiles")
                .select("account_type, employer_status, is_suspended")
                .eq("id", user.id)
                .maybeSingle();

        if (profileError || !profile) {
            throw profileError || new Error(
                "Could not verify your account."
            );
        }

        if (profile.is_suspended) {
            if (employerApprovalNotice) {
                employerApprovalNotice.style.display = "block";
                employerApprovalNotice.textContent =
                    "Your account is suspended. Please contact NaijaJobs support.";
            }
            if (message) message.textContent =
                "Job posting is unavailable for suspended accounts.";
            return;
        }

        if (profile.account_type !== "client") {
            if (employerApprovalNotice) {
                employerApprovalNotice.style.display = "block";
                employerApprovalNotice.textContent =
                    "Only employer accounts can post jobs.";
            }
            if (message) message.textContent =
                "You need an employer account to post a job.";
            return;
        }

        if (profile.employer_status !== "approved") {
            if (employerApprovalNotice) {
                employerApprovalNotice.style.display = "block";
                employerApprovalNotice.style.background = "#fff4d6";
                employerApprovalNotice.style.color = "#805b00";
                employerApprovalNotice.textContent =
                    profile.employer_status === "rejected"
                        ? "Your employer registration was rejected. You can log in, but you cannot post jobs. Please contact NaijaJobs support."
                        : "Your employer account is awaiting admin approval. You can use your account, but you cannot post jobs yet.";
            }

            if (message) {
                message.textContent =
                    "Job posting is unavailable until your employer account is approved.";
            }

            return;
        }

        if (employerApprovalNotice) {
            employerApprovalNotice.style.display = "none";
        }

        if (submitButton) submitButton.disabled = false;

    } catch (error) {
        console.error("Employer approval check failed:", error);

        if (employerApprovalNotice) {
            employerApprovalNotice.style.display = "block";
            employerApprovalNotice.textContent =
                "We couldn't verify your employer approval. Please refresh the page or try again later.";
        }

        if (message) {
            message.textContent =
                "Job posting is temporarily unavailable.";
        }
    }
}

if (postJobForm) {
    checkEmployerApproval();
}


if (postJobForm) {

postJobForm.addEventListener("submit", async function (event) {

    event.preventDefault();

    const message =
        document.getElementById("post-job-message");

    message.textContent = "Posting your job...";

    try {

        // Check logged-in user
        const {
            data: {
                user
            },
            error: authError
        } = await supabaseClient.auth.getUser();


        if (authError || !user) {

            window.location.href = "login.html";

            return;
        }

        
const {
    data: currentProfile,
    error: currentProfileError
} = await supabaseClient
    .from("profiles")
    .select("account_type, employer_status, is_suspended")
    .eq("id", user.id)
    .maybeSingle();

if (
    currentProfileError ||
    !currentProfile ||
    currentProfile.account_type !== "client" ||
    currentProfile.employer_status !== "approved" ||
    currentProfile.is_suspended
) {
    message.textContent =
        "Your employer account must be active and approved before you can post jobs.";

    await checkEmployerApproval();
    return;
}



        // Get form values
        const title =
            document.getElementById("job-title").value.trim();

        const description =
            document.getElementById("job-description").value.trim();

        const category =
            document.getElementById("job-category").value;

        const budget =
            Number(
                document.getElementById("job-budget").value
            );

        const location =
            document.getElementById("job-location").value.trim();

        const jobType =
            document.getElementById("job-type").value;

        const deadline =
            document.getElementById("job-deadline").value;


        // Insert job
        const {
            data,
            error
        } = await supabaseClient
            .from("jobs")
            .insert([
                {
                    user_id: user.id,
                    title: title,
                    description: description,
                    category: category,
                    budget: budget,
                    location: location,
                    job_type: jobType,
                    deadline: deadline,
                }
            ])
            .select();


        
if (error) {

    console.error("Job posting error details:", {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint
    });

    const errorText = (
        error?.message || ""
    ).toLowerCase();

    if (
        error?.code === "P0001" &&
        errorText.includes("monthly job posting limit")
    ) {
        message.textContent =
            "You've reached your monthly job posting limit. " +
            "Upgrade to Starter or Business to post more jobs.";
    } else if (
        error?.code === "42501" &&
        errorText.includes("own account")
    ) {
        message.textContent =
            "You can only post jobs using your own account.";
    } else {
        message.textContent =
            "Could not post your job: " +
            (error?.message || "Please try again.");
    }

    return;
}


        message.textContent =
            "Job posted successfully!";


        // Clear form
        postJobForm.reset();


        // Take user to browse jobs
        setTimeout(function () {

            window.location.href = "browse.html";

        }, 1000);


    } catch (error) {

        console.error(error);

        message.textContent =
            "Something went wrong. Please try again.";

    }

});

}
// ========================================
// BROWSE JOBS
// ========================================

const jobsContainer = document.getElementById("jobs-container");

if (jobsContainer) {
    let allJobs = [];
    let filteredJobs = [];
    let visibleJobCount = 12;
    const jobsPerPage = 12;

    const jobSearch = document.getElementById("job-search");
    const categoryFilter = document.getElementById("category-filter");
    const locationFilter = document.getElementById("location-filter");
    const typeFilter = document.getElementById("type-filter");
    const minBudgetFilter = document.getElementById("budget-min");
    const maxBudgetFilter = document.getElementById("budget-max");
    const sortFilter = document.getElementById("sort-filter");
    const clearFiltersButton = document.getElementById("clear-filters");
    const toggleFiltersButton = document.getElementById("toggle-filters");
    const loadMoreButton = document.getElementById("load-more");
    const jobsCount = document.getElementById("jobs-count");
    const filtersForm = document.getElementById("job-filters");

    function isFeatured(job) {
        return Boolean(job.featured_until && new Date(job.featured_until).getTime() > Date.now());
    }

    function applyJobFilters() {
        const search = (jobSearch?.value || "").trim().toLowerCase();
        const category = (categoryFilter?.value || "").trim().toLowerCase();
        const location = (locationFilter?.value || "").trim().toLowerCase();
        const type = (typeFilter?.value || "").trim().toLowerCase();
        const minValue = minBudgetFilter?.value.trim() || "";
        const maxValue = maxBudgetFilter?.value.trim() || "";
        const minBudget = minValue === "" ? null : Number(minValue);
        const maxBudget = maxValue === "" ? null : Number(maxValue);

        filteredJobs = allJobs.filter(function (job) {
            const haystack = [job.title, job.description, job.category, job.location, job.job_type]
                .map(function (value) { return String(value || "").toLowerCase(); }).join(" ");
            const jobCategory = String(job.category || "").toLowerCase();
            const jobLocation = String(job.location || "").toLowerCase();
            const jobType = String(job.job_type || "").toLowerCase().replace(/[ -]/g, "");
            const wantedType = type.replace(/[ -]/g, "");
            const budget = Number(job.budget);
            return (!search || haystack.includes(search)) &&
                (!category || jobCategory === category) &&
                (!location || jobLocation.includes(location)) &&
                (!wantedType || jobType === wantedType) &&
                (minBudget === null || (Number.isFinite(budget) && budget >= minBudget)) &&
                (maxBudget === null || (Number.isFinite(budget) && budget <= maxBudget));
        });

        const sortBy = sortFilter?.value || "newest";
        filteredJobs.sort(function (a, b) {
            const featuredDifference = Number(isFeatured(b)) - Number(isFeatured(a));
            if (featuredDifference !== 0) return featuredDifference;
            if (sortBy === "budget_high") return Number(b.budget || 0) - Number(a.budget || 0);
            if (sortBy === "deadline") {
                const aDate = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
                const bDate = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
                return aDate - bDate;
            }
            return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        });
        visibleJobCount = jobsPerPage;
        displayJobs();
    }

    function displayJobs() {
        const shownJobs = filteredJobs.slice(0, visibleJobCount);
        jobsContainer.replaceChildren();
        if (!shownJobs.length) {
            const empty = document.createElement("p");
            empty.textContent = allJobs.length ? "No jobs match those filters. Try changing or clearing them." : "No open jobs are available right now. Please check back soon.";
            jobsContainer.appendChild(empty);
        } else {
            shownJobs.forEach(function (job) {
                const card = document.createElement("article");
                card.className = "job-card" + (isFeatured(job) ? " job-card-featured" : "");
                const budget = Number(job.budget);
                const budgetText = Number.isFinite(budget) ? budget.toLocaleString("en-NG") : "Negotiable";
                const deadlineText = job.deadline ? new Date(job.deadline).toLocaleDateString("en-GB") : "Not specified";
                card.innerHTML = `
                    <div class="job-card-content">
                        ${isFeatured(job) ? '<span class="featured-badge">Featured</span>' : ""}
                        <span class="job-category">${escapeHTML(job.category || "Other")}</span>
                        <h3>${escapeHTML(job.title || "Untitled job")}</h3>
                        <p class="job-description">${escapeHTML(job.description || "No description provided.")}</p>
                        <div class="job-details">
                            <span>₦${budgetText}</span>
                            <span>${escapeHTML(job.location || "Location not specified")}</span>
                            <span>${escapeHTML(job.job_type || "Not specified")}</span>
                        </div>
                        <p class="job-deadline">Deadline: ${escapeHTML(deadlineText)}</p>
                        <a href="job.html?id=${encodeURIComponent(job.id)}" class="job-button">View Job</a>
                    </div>`;
                jobsContainer.appendChild(card);
            });
        }
        if (jobsCount) {
            jobsCount.textContent = filteredJobs.length + " open job" + (filteredJobs.length === 1 ? "" : "s") +
                (filteredJobs.length ? " · Showing " + shownJobs.length : "");
        }
        if (loadMoreButton) {
            loadMoreButton.hidden = visibleJobCount >= filteredJobs.length;
        }
    }

    async function loadJobs() {
        jobsContainer.innerHTML = '<div class="loading"><span class="nj-loading-spinner"></span><p>Loading jobs...</p></div>';
        try {
            let result = await supabaseClient
                .from("jobs")
                .select("id, user_id, title, description, category, budget, location, job_type, deadline, status, created_at, featured_until")
                .eq("status", "open")
                .is("archived_at", null)
                .order("created_at", { ascending: false });
            // Keep ordinary job browsing working if the optional featured-jobs SQL
            // has not been run in this Supabase project yet.
            if (result.error && /featured_until|column .* does not exist/i.test(result.error.message || "")) {
                result = await supabaseClient
                    .from("jobs")
                    .select("id, user_id, title, description, category, budget, location, job_type, deadline, status, created_at")
                    .eq("status", "open")
                    .is("archived_at", null)
                    .order("created_at", { ascending: false });
            }
            if (result.error) throw result.error;
            const jobs = result.data;
            allJobs = jobs || [];
            applyJobFilters();
        } catch (error) {
            console.error("Jobs loading error:", error);
            jobsContainer.innerHTML = "<p>Could not load jobs. Please refresh and try again.</p>";
            if (jobsCount) jobsCount.textContent = "";
            if (loadMoreButton) loadMoreButton.hidden = true;
        }
    }

    [jobSearch, categoryFilter, locationFilter, typeFilter, minBudgetFilter, maxBudgetFilter, sortFilter]
        .filter(Boolean).forEach(function (control) {
            control.addEventListener(control.tagName === "INPUT" ? "input" : "change", applyJobFilters);
        });

    if (filtersForm) {
        filtersForm.addEventListener("submit", function (event) { event.preventDefault(); applyJobFilters(); });
    }
    if (clearFiltersButton) {
        clearFiltersButton.addEventListener("click", function () {
            [jobSearch, locationFilter, minBudgetFilter, maxBudgetFilter].filter(Boolean).forEach(function (el) { el.value = ""; });
            if (categoryFilter) categoryFilter.value = "";
            if (typeFilter) typeFilter.value = "";
            if (sortFilter) sortFilter.value = "newest";
            if (filtersForm) filtersForm.classList.remove("filters-expanded");
            if (toggleFiltersButton) { toggleFiltersButton.setAttribute("aria-expanded", "false"); toggleFiltersButton.textContent = "More filters"; }
            applyJobFilters();
        });
    }
    if (toggleFiltersButton && filtersForm) {
        toggleFiltersButton.addEventListener("click", function () {
            const expanded = filtersForm.classList.toggle("filters-expanded");
            toggleFiltersButton.setAttribute("aria-expanded", String(expanded));
            toggleFiltersButton.textContent = expanded ? "Fewer filters" : "More filters";
        });
    }
    if (loadMoreButton) {
        loadMoreButton.addEventListener("click", function () {
            visibleJobCount += jobsPerPage;
            displayJobs();
        });
    }
    loadJobs();
}

// ========================================
// ESCAPE HTML
// ========================================

function escapeHTML(value) {


if (value === null || value === undefined) {
    return "";
}

return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");


}
// ========================================
// JOB DETAILS
// ========================================

const jobDetailsContainer =
document.getElementById(
"job-details-container"
);

if (jobDetailsContainer) {

async function loadJobDetails() {

    // Get job ID from URL
    const params =
        new URLSearchParams(
            window.location.search
        );

    const jobId =
        params.get("id");


    if (!jobId) {

        jobDetailsContainer.innerHTML = `
            <p>Job not found.</p>
        `;

        return;
    }


    try {

        const {
            data: job,
            error
        } = await supabaseClient
            .from("jobs")
            .select("*")
            .eq("id", jobId)
            .single();


        if (error) {

            console.error(
                "Job details error:",
                error
            );

            jobDetailsContainer.innerHTML = `
                <p>Could not load this job.</p>
            `;

            return;
        }


        const budget =
            Number(job.budget).toLocaleString();


        jobDetailsContainer.innerHTML = `

            <div class="job-details-card">

                <span class="job-category">
                    ${escapeHTML(job.category)}
                </span>


                <h1>
                    ${escapeHTML(job.title)}
                </h1>


                <div class="job-meta">

                    <span>
                        💰 ₦${budget}
                    </span>

                    <span>
                        📍 ${escapeHTML(job.location)}
                    </span>

                    <span>
                        💼 ${escapeHTML(job.job_type)}
                    </span>

                    <span>
                        📅 ${escapeHTML(job.deadline)}
                    </span>

                </div>
                <p class="rating-line" data-rating-user="${escapeHTML(job.user_id)}" data-rating-label="Client" hidden></p>


                <hr>


                <h2>
                    Job Description
                </h2>


                <p class="full-job-description">${escapeHTML(job.description)}</p>


                <div class="job-action">

    <button
        id="apply-job-button"
        class="apply-button"
    >
        Apply for This Job
    </button>

    <button
        id="report-job-button"
        type="button"
        class="apply-button"
        style="background: #fff; color: #b42318; border: 1px solid #b42318; margin-top: 10px;"
    >
        Report This Job
    </button>

    <div id="report-job-form" hidden style="margin-top: 16px;">

        <h3>Report this job</h3>

        <label for="report-job-reason">Reason for reporting</label>

        <select id="report-job-reason" required>
            <option value="">Choose a reason</option>
            <option value="payment">Suspicious payment request</option>
            <option value="fake">Fake job or scam</option>
            <option value="inappropriate">Inappropriate content</option>
            <option value="spam">Spam or misleading posting</option>
            <option value="other">Other</option>
        </select>

        <label for="report-job-details">Additional details (optional)</label>

        <textarea
            id="report-job-details"
            rows="4"
            maxlength="2000"
            placeholder="Tell us what seems wrong..."
        ></textarea>

        <button id="submit-job-report" type="button" class="apply-button">
            Submit Report
        </button>

        <button id="cancel-job-report" type="button">
            Cancel
        </button>

        <p id="report-job-message" role="status" aria-live="polite"></p>

    </div>

</div>

            </div>

        `;


        fillRatings(jobDetailsContainer);

        
        // ========================================
        // REPORT JOB
        // ========================================

        const reportButton =
            document.getElementById("report-job-button");

        const reportForm =
            document.getElementById("report-job-form");

        const reportReason =
            document.getElementById("report-job-reason");

        const reportDetails =
            document.getElementById("report-job-details");

        const submitReportButton =
            document.getElementById("submit-job-report");

        const cancelReportButton =
            document.getElementById("cancel-job-report");

        const reportMessage =
            document.getElementById("report-job-message");


        if (reportButton && reportForm) {

            reportButton.addEventListener("click", function () {
                reportForm.hidden = !reportForm.hidden;
            });

        }


        if (cancelReportButton && reportForm) {

            cancelReportButton.addEventListener("click", function () {
                reportForm.hidden = true;
                reportMessage.textContent = "";
            });

        }


        if (submitReportButton) {

            submitReportButton.addEventListener("click", async function () {

                reportMessage.textContent = "";

                const reason = reportReason.value.trim();
                const details = reportDetails.value.trim();

                if (!reason) {
                    reportMessage.textContent = "Please choose a reason for reporting.";
                    return;
                }

                const {
                    data: { user },
                    error: authError
                } = await supabaseClient.auth.getUser();

                if (authError || !user) {
                    window.location.href = "login.html";
                    return;
                }

                if (user.id === job.user_id) {
                    reportMessage.textContent = "You cannot report your own job.";
                    return;
                }

                submitReportButton.disabled = true;
                submitReportButton.textContent = "Submitting...";

                try {

                    const { error: reportError } =
                        await supabaseClient
                            .from("reports")
                            .insert({
                                reporter_id: user.id,
                                target_type: "job",
                                target_id: String(job.id),
                                reason: reason,
                                details: details || null
                            });

                    if (reportError) {
                        console.error("Job report error:", reportError);
                        reportMessage.textContent =
                            "Could not submit your report. Please try again.";
                        return;
                    }

                    reportMessage.textContent =
                        "Report submitted successfully. Thank you for helping keep NaijaJobs safe.";

                    reportReason.value = "";
                    reportDetails.value = "";

                } catch (error) {

                    console.error("Job report error:", error);
                    reportMessage.textContent =
                        "Something went wrong. Please try again.";

                } finally {

                    submitReportButton.disabled = false;
                    submitReportButton.textContent = "Submit Report";

                }

            });

        }

        const applyButton =
            document.getElementById(
                "apply-job-button"
            );


        if (applyButton) {

applyButton.addEventListener(
    "click",
    async function () {

        // Check if user is logged in
        const {
            data: {
                user
            },
            error: authError
        } = await supabaseClient.auth.getUser();


        if (authError || !user) {
            window.location.href = "login.html?next=" + encodeURIComponent("job.html?id=" + job.id);
            return;
        }

        if (job.status !== "open") {
            alert("This job is no longer accepting applications.");
            return;
        }

        const { data: applicantProfile, error: applicantProfileError } = await supabaseClient
            .from("profiles")
            .select("account_type, is_suspended")
            .eq("id", user.id)
            .maybeSingle();
        if (applicantProfileError || !applicantProfile || applicantProfile.is_suspended) {
            alert("We could not verify your account. Please refresh or contact support.");
            return;
        }
        if (!["worker", "job_seeker"].includes(applicantProfile.account_type)) {
            alert("Only job seekers can apply for jobs. Please use a job seeker account.");
            return;
        }

        // Prevent the job owner from applying
        if (user.id === job.user_id) {

            alert(
                "You cannot apply for your own job."
            );

            return;
        }


        // Show application form
        const existingForm =
            document.getElementById(
                "application-form"
            );

        if (existingForm) {
            return;
        }


        const applicationForm =
            document.createElement("div");

        applicationForm.id =
            "application-form";

        applicationForm.className =
            "application-form";


        applicationForm.innerHTML = `

            <h2>
                Apply for This Job
            </h2>

            <p>
                Tell the client why you are a good fit
                for this job.
            </p>

            
<textarea
    id="cover-message"
    placeholder="Write your application message..."
    rows="6"
    required
></textarea>

<div class="application-attachments-field">

    <label for="application-files">
        Attach files (optional)
    </label>

    <p>
        You can attach up to 5 documents, pictures, or videos.
        Maximum size: 25 MB per file.
    </p>

    <input
        type="file"
        id="application-files"
        multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
    />

    <p
        id="application-files-message"
        class="form-message"
    ></p>

</div>


            <button
                id="submit-application"
                class="apply-button"
            >
                Submit Application
            </button>

            <p
                id="application-message"
                class="form-message"
            ></p>

        `;


        document
            .querySelector(".job-action")
            .appendChild(applicationForm);


        const submitApplication =
            document.getElementById(
                "submit-application"
            );


        submitApplication.addEventListener(
            "click",
            async function () {

                const coverMessage =
                    document
                        .getElementById(
                            "cover-message"
                        )
                        .value
                        .trim();


                const applicationMessage =
                    document.getElementById(
                        "application-message"
                    );

                    
const applicationFilesInput =
    document.getElementById("application-files");

const selectedFiles = Array.from(
    applicationFilesInput.files
);

const allowedExtensions = [
    "pdf", "doc", "docx", "xls", "xlsx", "txt",
    "jpg", "jpeg", "png", "webp", "gif",
    "mp4", "webm", "mov"
];

const maxFileSize = 25 * 1024 * 1024;

if (selectedFiles.length > 5) {
    applicationMessage.textContent =
        "Please select no more than 5 files.";

    applicationMessage.style.color = "red";
    return;
}

const invalidFile = selectedFiles.find((file) => {
    const extension = file.name
        .split(".")
        .pop()
        .toLowerCase();

    return (
        file.size > maxFileSize ||
        !allowedExtensions.includes(extension)
    );
});

if (invalidFile) {
    applicationMessage.textContent =
        invalidFile.size > maxFileSize
            ? `"${invalidFile.name}" exceeds the 25 MB file limit.`
            : `"${invalidFile.name}" has an unsupported file type.`;

    applicationMessage.style.color = "red";
    return;
}



                if (!coverMessage) {

                    applicationMessage.textContent =
                        "Please write a message before applying.";

                    return;
                }


                submitApplication.disabled =
                    true;

                submitApplication.textContent =
                    "Submitting...";


                try {

                    
const {
    data: application,
    error
} = await supabaseClient
    .from("applications")
    .insert([
        {
            job_id: job.id,
            user_id: user.id,
            cover_message: coverMessage
        }
    ])
    .select("id")
    .single();


if (error) {
    console.error("Application error:", error);

    if (
        error.code === "23505" &&
        error.message.includes(
            "applications_one_active_per_job_user"
        )
    ) {
        applicationMessage.textContent =
            "You already have a pending or accepted application for this job.";
    } else {
        applicationMessage.textContent =
            "We couldn't submit your application. Please try again.";
    }

    applicationMessage.style.color = "red";
    submitApplication.disabled = false;
    submitApplication.textContent = "Submit Application";

    return;
}


// Upload optional attachments after creating the application.

const uploadedAttachments = [];
const uploadedStoragePaths = [];

async function cleanupUploadedFiles() {
    if (uploadedStoragePaths.length === 0) {
        return;
    }

    const { error: cleanupError } =
        await supabaseClient.storage
            .from("application-attachments")
            .remove(uploadedStoragePaths);

    if (cleanupError) {
        console.error(
            "Attachment cleanup error:",
            cleanupError
        );
    }
}


for (const file of selectedFiles) {
    const safeFileName = file.name.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
    );

    const uniqueFileId =
    `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    
    const storagePath =
    `${user.id}/${application.id}/${uniqueFileId}-${safeFileName}`;


    const {
        error: uploadError
    } = await supabaseClient.storage
        .from("application-attachments")
        .upload(storagePath, file, {
            contentType: file.type,
            upsert: false
        });

    if (uploadError) {
        console.error(
            "Attachment upload error:",
            uploadError
        );

        await cleanupUploadedFiles();

        applicationMessage.textContent =
            "Your application was created, but an attachment could not be uploaded. Please contact support before applying again.";

        applicationMessage.style.color = "red";
        submitApplication.textContent = "Application Created";

        return;
    }

    uploadedStoragePaths.push(storagePath);

    uploadedAttachments.push({
        application_id: application.id,
        uploader_id: user.id,
        storage_path: storagePath,
        original_filename: file.name,
        mime_type: file.type,
        file_size: file.size
    });
}


// Register uploaded files in the metadata table.
if (uploadedAttachments.length > 0) {
    const {
        error: metadataError
    } = await supabaseClient
        .from("application_attachments")
        .insert(uploadedAttachments);

    if (metadataError) {
        console.error(
            "Attachment metadata error:",
            metadataError
        );

        await cleanupUploadedFiles();

        applicationMessage.textContent =
            "Your application was created, but its attachment records could not be saved. Please contact support.";

        applicationMessage.style.color = "red";
        submitApplication.textContent = "Application Created";

        return;
    }
}



                    applicationMessage.textContent =
                        "Application submitted successfully!";

                    applicationMessage.style.color =
                        "green";

                    submitApplication.textContent =
                        "Application Submitted";


                    document
                        .getElementById(
                            "cover-message"
                        )
                        .disabled = true;


                } catch (error) {

                    console.error(error);

                    applicationMessage.textContent =
                        "Something went wrong. Please try again.";

                    submitApplication.disabled =
                        false;

                    submitApplication.textContent =
                        "Submit Application";

                }

            }
        );

    }
);


}


    } catch (error) {

        console.error(error);

        jobDetailsContainer.innerHTML = `
            <p>
                Something went wrong while loading this job.
            </p>
        `;

    }

}


loadJobDetails();


}

/* =========================================
   OPEN OR CREATE ACCEPTED APPLICATION CHAT
========================================= */

async function openAcceptedApplicationConversation(applicationId) {
    try {
        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser();

        if (authError || !user) {
            window.location.href = "login.html";
            return;
        }

        // Load the application and the employer who owns the job.
        const { data: application, error: applicationError } =
            await supabaseClient
                .from("applications")
                .select(`
                    id,
                    user_id,
                    job_id,
                    status,
                    jobs (
                        user_id
                    )
                `)
                .eq("id", applicationId)
                .maybeSingle();

        if (applicationError) throw applicationError;

        if (!application || application.status !== "accepted") {
            alert("Messaging is available only after an application is accepted.");
            return;
        }

        const employerId = application.jobs?.user_id;
        const seekerId = application.user_id;

        // Only the applicant or the job's owner can open this chat.
        if (user.id !== seekerId && user.id !== employerId) {
            alert("You are not authorized to access this conversation.");
            return;
        }

        const otherUserId =
            user.id === seekerId ? employerId : seekerId;
            
console.log("NaijaJobs conversation diagnostic:", {
    signedInUserId: user.id,
    applicationId: application.id,
    applicationStatus: application.status,
    jobSeekerId: seekerId,
    employerId: employerId,
    signedInUserIsJobSeeker: user.id === seekerId,
    signedInUserIsEmployer: user.id === employerId,
    participantOne: user.id,
    participantTwo: otherUserId
});


        if (!otherUserId || otherUserId === user.id) {
            alert("The other participant could not be identified.");
            return;
        }

        
        const { data: conversationId, error: openError } =
            await supabaseClient.rpc(
                "open_accepted_application_conversation",
                {
                    p_application_id: application.id
                }
            );

        if (openError) throw openError;

        if (!conversationId) {
            throw new Error("No conversation ID was returned.");
        }

        window.location.href =
            `message.html?conversation=${encodeURIComponent(conversationId)}`;

    } catch (error) {
        console.error("Could not open application conversation:", error);

        alert(
            error.message ||
            "Could not open the conversation. Please try again."
        );
    }
}

/* ========================================
   MY APPLICATIONS
======================================== */

const applicationsContainer =
    document.getElementById("applications-container");

if (applicationsContainer) {

    async function loadApplications() {

        const totalElement =
            document.getElementById("seeker-total-applications");

        const pendingElement =
            document.getElementById("seeker-pending-applications");

        const acceptedElement =
            document.getElementById("seeker-accepted-applications");

        const rejectedElement =
            document.getElementById("seeker-rejected-applications");


        function updateStatistics(applications) {

            const total = applications.length;

            const pending = applications.filter(
                app => app.status === "pending"
            ).length;

            const accepted = applications.filter(
                app => app.status === "accepted"
            ).length;

            const rejected = applications.filter(
                app => app.status === "rejected"
            ).length;

            if (totalElement) {
                totalElement.textContent = total;
            }

            if (pendingElement) {
                pendingElement.textContent = pending;
            }

            if (acceptedElement) {
                acceptedElement.textContent = accepted;
            }

            if (rejectedElement) {
                rejectedElement.textContent = rejected;
            }
        }


        function formatStatus(status) {

            const normalized = String(
                status || ""
            ).trim().toLowerCase();

            const knownStatuses = {
                pending: {
                    label: "Pending",
                    className: "status-pending"
                },

                accepted: {
                    label: "Accepted",
                    className: "status-accepted"
                },

                rejected: {
                    label: "Rejected",
                    className: "status-rejected"
                }
            };

            if (knownStatuses[normalized]) {
                return knownStatuses[normalized];
            }

            return {
                label: normalized
                    ? normalized.replace(/_/g, " ")
                    : "Status unavailable",

                className: "status-unknown"
            };
        }


        try {

            applicationsContainer.innerHTML = `
                <div class="nj-applications-loading">
                    <span class="nj-loading-spinner"></span>
                    <p>Loading your applications...</p>
                </div>
            `;


            const {
                data: { user },
                error: authError
            } = await supabaseClient.auth.getUser();


            if (authError || !user) {
                window.location.href = "login.html";
                return;
            }


            const {
                data: applications,
                error
            } = await supabaseClient
                .from("applications")
.select(`
    id,
    job_id,
    cover_message,
    status,
    created_at,
    client_completed_at,
    job_seeker_completed_at,
    completed_at,
    payment_status,
    jobs (
    id,
    user_id,
    title,
    category,
    budget,
    location,
    job_type,
    deadline,
    status
    )
`)

                .eq("user_id", user.id)
                .order("created_at", {
                    ascending: false
                });


            if (error) {
                throw error;
            }


            const safeApplications = applications || [];

            updateStatistics(safeApplications);


            if (safeApplications.length === 0) {

                applicationsContainer.innerHTML = `
                    <div class="empty-applications">
                        <h2>No applications yet</h2>

                        <p>
                            Find a job and submit your first application.
                        </p>

                        <a
                            href="browse.html"
                            class="apply-button"
                        >
                            Find Jobs
                        </a>
                    </div>
                `;

                return;
            }


            applicationsContainer.innerHTML = "";


            safeApplications.forEach(function (application) {

                const job = application.jobs;

                if (!job) {
                    return;
                }


                const card = document.createElement("article");

                card.className = "application-card";


                const status = formatStatus(
                    application.status
                );


                const budget = Number(job.budget || 0)
                    .toLocaleString("en-NG");


                const appliedDate = application.created_at
                    ? new Date(
                        application.created_at
                    ).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric"
                    })
                    : "Date unavailable";


                card.innerHTML = `

                    <div class="application-card-top">

                        <div class="application-heading">

                            <span class="job-category">
                                ${escapeHTML(job.category || "General")}
                            </span>

                            <h2>
                                ${escapeHTML(job.title || "Untitled job")}
                            </h2>

                        </div>

                        <span class="application-status ${status.className}">
                            ${escapeHTML(status.label)}
                        </span>

                    </div>


                    <div class="application-details">

                        <span>
                            💰 ₦${budget}
                        </span>

                        <span>
                            📍 ${escapeHTML(job.location || "Not specified")}
                        </span>

                        <span>
                            💼 ${escapeHTML(job.job_type || "Not specified")}
                        </span>

                    </div>


                    <p class="application-message">

                        <strong>Your message:</strong>

                        ${escapeHTML(application.cover_message || "No cover message provided.")}

                    </p>


                    <p class="application-date">
                        Applied: ${escapeHTML(appliedDate)}
                    </p>


                    
${
    application.status === "accepted"
    ? `
        <div class="worker-completion-status">

            ${
                application.completed_at
                ? `
                    <p>
                        ✓ Work completed and confirmed by the client.
                    </p>
                `
                : application.job_seeker_completed_at
                ? `
                    <p>
                        ✓ You marked this work as completed.
                        Waiting for the client to confirm.
                    </p>
                `
                : job.status !== "completed"
                ? `
                    <button
                        type="button"
                        class="mark-my-work-completed job-button"
                        data-application-id="${escapeHTML(application.id)}"
                    >
                        Mark My Work as Completed
                    </button>
                `
                : `
                    <p>
                        This job has been marked completed.
                        Contact the client if your completion is not recorded.
                    </p>
                `
            }

        </div>
    `
    : ""
}


<div class="application-card-actions">

    <a
        href="worker-profile.html?id=${encodeURIComponent(job.user_id)}"
        class="job-button"
    >
        View Client Profile
    </a>

    <a
        href="job.html?id=${encodeURIComponent(job.id)}"
        class="job-button"
    >
        View Job
    </a>

</div>



                `;
                
const messageButton = card.querySelector(
    ".nj-message-employer-button"
);

if (messageButton) {
    messageButton.addEventListener("click", function () {
        openAcceptedApplicationConversation(application.id);
    });
}



                applicationsContainer.appendChild(card);

                // ========================================
                // SHOW MY APPLICATION ATTACHMENTS
                // ========================================

                const attachmentSection =
                    document.createElement("div");

                attachmentSection.className =
                    "seeker-application-attachments";

                attachmentSection.innerHTML = `
                    <strong>My Submitted Attachments</strong>
                    <p>Loading attachments...</p>
                `;

                card.appendChild(attachmentSection);

                (async function () {

                    try {

                        const {
                            data: attachments,
                            error
                        } = await supabaseClient
                            .from("application_attachments")
                            .select(`
                                original_filename,
                                file_size,
                                storage_path
                            `)
                            .eq(
                                "application_id",
                                application.id
                            )
                            .order("created_at", {
                                ascending: true
                            });

                        if (error) {
                            throw error;
                        }

                        attachmentSection.innerHTML = "";

                        const heading =
                            document.createElement("strong");

                        heading.textContent =
                            "My Submitted Attachments";

                        attachmentSection.appendChild(heading);

                        if (!attachments || attachments.length === 0) {

                            const emptyMessage =
                                document.createElement("p");

                            emptyMessage.textContent =
                                "No attachments were submitted.";

                            attachmentSection.appendChild(
                                emptyMessage
                            );

                            return;
                        }

                        const fileList =
                            document.createElement("ul");

                        for (const attachment of attachments) {

                            const item =
                                document.createElement("li");

                            const link =
                                document.createElement("a");

                            link.href = "#";

                            link.textContent =
                                attachment.original_filename;

                            link.addEventListener(
                                "click",
                                async function (event) {

                                    event.preventDefault();

                                    link.textContent =
                                        "Preparing secure link...";

                                    try {

                                        const {
                                            data,
                                            error: linkError
                                        } = await supabaseClient
                                            .storage
                                            .from("application-attachments")
                                            .createSignedUrl(
                                                attachment.storage_path,
                                                300,
                                                {
                                                    download:
                                                        attachment.original_filename
                                                }
                                            );

                                        if (linkError || !data?.signedUrl) {
                                            throw linkError ||
                                                new Error("Secure link unavailable.");
                                        }

                                        const downloadLink =
                                            document.createElement("a");

                                        downloadLink.href =
                                            data.signedUrl;

                                        downloadLink.target = "_blank";

                                        downloadLink.rel =
                                            "noopener noreferrer";

                                        downloadLink.download =
                                            attachment.original_filename;

                                        document.body.appendChild(
                                            downloadLink
                                        );

                                        downloadLink.click();

                                        downloadLink.remove();

                                    } catch (error) {

                                        console.error(
                                            "Could not open attachment:",
                                            error
                                        );

                                        alert(
                                            "Could not open this attachment. Please try again."
                                        );

                                    } finally {

                                        link.textContent =
                                            attachment.original_filename;

                                    }

                                }
                            );

                            const size =
                                document.createElement("span");

                            size.textContent =
                                " (" +
                                (attachment.file_size / 1024).toFixed(1) +
                                " KB)";

                            item.appendChild(link);
                            item.appendChild(size);

                            fileList.appendChild(item);
                        }

                        attachmentSection.appendChild(fileList);

                    } catch (error) {

                        console.error(
                            "Could not load my attachments:",
                            error
                        );

                        attachmentSection.innerHTML =
                            "<strong>My Submitted Attachments</strong>" +
                            "<p>Attachments could not be loaded. Please refresh the page.</p>";

                    }

                })();

            });


        } catch (error) {

            console.error(
                "Could not load applications:",
                error
            );

            applicationsContainer.innerHTML = `
                <div class="empty-applications">
                    <h2>Unable to load applications</h2>

                    <p>
                        Please refresh the page and try again.
                    </p>

                    <button
                        type="button"
                        class="job-button"
                        onclick="window.location.reload()"
                    >
                        Try Again
                    </button>
                </div>
            `;

        }

    }


    loadApplications();
    
    // ========================================
    // MARK MY WORK AS COMPLETED
    // ========================================

    applicationsContainer.addEventListener(
        "click",
        async function (event) {

            const button = event.target.closest(
                ".mark-my-work-completed"
            );

            if (!button) {
                return;
            }

            const applicationId =
                button.dataset.applicationId;

            const confirmed = confirm(
                "Have you completed the work for this job? The client will be asked to confirm."
            );

            if (!confirmed) {
                return;
            }

            button.disabled = true;
            button.textContent = "Submitting...";

            try {

                const { error } =
                    await supabaseClient.rpc(
                        "mark_application_work_completed",
                        {
                            p_application_id: applicationId
                        }
                    );

                if (error) {
                    throw error;
                }

                alert(
                    "Your completion has been submitted. The client can now confirm the work."
                );

                await loadApplications();

            } catch (error) {

                console.error(
                    "Mark work completed error:",
                    error
                );

                alert(
                    error.message ||
                    "Could not submit completion. Please try again."
                );

                button.disabled = false;
                button.textContent =
                    "Mark My Work as Completed";
            }

        }
    );


    // ========================================
    // REALTIME APPLICATION STATUS UPDATES
    // ========================================

    let applicationsChannel = null;

    async function subscribeToApplicationUpdates() {

        const {
            data: { user },
            error
        } = await supabaseClient.auth.getUser();

        if (error || !user) {
            return;
        }

        // Avoid creating duplicate subscriptions.
        if (applicationsChannel) {
            await supabaseClient.removeChannel(
                applicationsChannel
            );
        }

        applicationsChannel = supabaseClient
            .channel("seeker-application-status-updates")
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "applications",
                    filter: `user_id=eq.${user.id}`
                },
                function () {
                    loadApplications();
                }
            )
            .subscribe(function (status) {
                if (status === "CHANNEL_ERROR") {
                    console.error(
                        "Could not subscribe to application updates."
                    );
                }
            });
    }

    subscribeToApplicationUpdates();


}

// ========================================
// MY JOBS
// ========================================

const myJobsContainer =
document.getElementById(
"my-jobs-container"
);

if (myJobsContainer) {

async function loadMyJobs() {

    try {

        // Check logged-in user
        const {
            data: {
                user
            },
            error: authError
        } = await supabaseClient.auth.getUser();


        if (authError || !user) {

            window.location.href =
                "login.html";

            return;
        }


        // Load jobs posted by this user
        const {
            data: jobs,
            error
        } = await supabaseClient
            .from("jobs")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", {
                ascending: false
            });


        if (error) {

            console.error(
                "My jobs error:",
                error
            );

            myJobsContainer.innerHTML =
                "<p>Could not load your jobs.</p>";

            return;
        }


        if (!jobs || !jobs.length) {

            myJobsContainer.innerHTML = `

                <div class="empty-my-jobs">

                    <h2>
                        You haven't posted any jobs yet.
                    </h2>

                    <p>
                        Post your first job and start receiving applications.
                    </p>

                    <a
                        href="post-job.html"
                        class="apply-button"
                    >
                        Post a Job
                    </a>

                </div>

            `;

            return;
        }


        myJobsContainer.innerHTML = "";


        jobs.forEach(function (job) {

            const card =
                document.createElement("div");

            card.className =
                "my-job-card";


            const budget =
                Number(job.budget)
                    .toLocaleString();


            card.innerHTML = `

                <div class="my-job-top">

                    <div>

                        <span class="job-category">
                            ${escapeHTML(job.category)}
                        </span>

                        <h2>
                            ${escapeHTML(job.title)}
                        </h2>

                    </div>


                                        <div class="my-job-status-group">

                        ${
                            job.featured_until &&
                            new Date(job.featured_until) > new Date()
                                ? `<span class="featured-job-badge">
                                       ⭐ Featured
                                   </span>`
                                : ""
                        }

                        <span class="my-job-status">
                            ${escapeHTML(String(job.status || "").replace(/_/g, " "))}
                        </span>

                    </div>

                </div>


                <p class="my-job-description">
                    ${escapeHTML(job.description)}
                </p>


                <div class="application-details">

                    <span>
                        💰 ₦${budget}
                    </span>

                    <span>
                        📍 ${escapeHTML(job.location)}
                    </span>

                    <span>
                        💼 ${escapeHTML(job.job_type)}
                    </span>

                    <span>
                        📅 ${escapeHTML(job.deadline)}
                    </span>

                </div>


                <div class="my-job-actions">

    <a
        href="job.html?id=${job.id}"
        class="job-button"
    >
        View Job
    </a>

    <a
        href="applicants.html?id=${job.id}"
        class="job-button secondary-job-button"
    >
        View Applicants
    </a>

</div>

<div
    class="feature-box"
    data-job-id="${job.id}"
>
    <button
        type="button"
        class="job-button feature-open"
    >
        ⭐ Feature this job
    </button>

    <div
        class="feature-panel"
        hidden
    ></div>
</div>

            `;


            myJobsContainer.appendChild(card);

        });

    } catch (error) {

        console.error(error);

        myJobsContainer.innerHTML =
            "<p>Something went wrong.</p>";

    }

}


loadMyJobs();


}

// ========================================
// JOB APPLICANTS
// ========================================

const applicantsContainer =
document.getElementById(
    "applicants-container"
);

if (applicantsContainer) {

async function loadApplicants() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    const jobId =
        params.get("id");


    if (!jobId) {
        return;
    }


    try {

        // ================================
        // CHECK LOGGED-IN USER
        // ================================

        const {
            data: {
                user
            }
        } =
            await supabaseClient.auth.getUser();


        if (!user) {
            return;
        }


        // ================================
        // GET JOB OWNER
        // ================================

        const {
            data: job,
            error: jobError
        } =
            await supabaseClient
                .from("jobs")
                .select("user_id")
                .eq("id", jobId)
                .single();


        if (jobError || !job) {

            console.error(
                "Job error:",
                jobError
            );

            return;
        }


        // ================================
        // ONLY JOB OWNER CAN SEE APPLICANTS
        // ================================

        if (job.user_id !== user.id) {

            applicantsContainer.innerHTML = "";

            return;
        }

       
        // ================================
        // GET APPLICATIONS
        // ================================

        const {
            data: applications,
            error
        } =
            await supabaseClient
                .from("applications")
                .select(`
                    id,
                    user_id,
                    cover_message,
                    status,
                    created_at,
                    job_seeker_completed_at,
                    client_completed_at,
                    completed_at
                `)
                .eq("job_id", jobId)
                .order("created_at", {
                    ascending: false
                });


        if (error) {

            console.error(
                "Applicants error:",
                error
            );

            applicantsContainer.innerHTML = `
                <p>
                    Could not load applicants.
                </p>
            `;

            return;
        }
        

        // ================================
        // NO APPLICANTS
        // ================================

        if (
            !applications ||
            !applications.length
        ) {

            applicantsContainer.innerHTML = `

                <h2>
                    Applicants
                </h2>

                <div class="no-applicants">

                    <p>
                        No one has applied for this job yet.
                    </p>

                </div>

            `;

            return;
        }


        // ================================
        // GET APPLICANT USER IDs
        // ================================

        const applicantIds =
            applications.map(
                function (application) {

                    return application.user_id;

                }
            );


        
        // ================================
        // GET APPLICANT PROFILES
        // ================================

        const {
            data: profiles,
            error: profileError
        } = await supabaseClient
            .from("profiles")
            .select(`
                id,
                full_name,
                location,
                skills
            `);

        if (profileError) {
            console.error(
                "Profile loading error:",
                profileError
            );
        }

        console.log("Applications:", applications);
        console.log("All returned profiles:", profiles);

        applications.forEach(function (application) {

            const profile = profiles?.find(function (item) {
                return item.id === application.user_id;
            });

            console.log("Application user ID:", application.user_id);
            console.log("Matched profile:", profile);
            console.log("Applicant location:", profile?.location);
            console.log("Applicant skills:", profile?.skills);

        });

        // ================================
        // APPLICANTS HEADING
        // ================================

        applicantsContainer.innerHTML = `

            <h2>
                Applicants
            </h2>

        `;


        // ================================
        // CREATE APPLICANT CARDS
        // ================================

        applications.forEach(
            function (application) {

                const card =
                    document.createElement("div");

                card.className =
                    "applicant-card";


                const status =
                    application.status ||
                    "pending";


                // Find matching profile
                const profile =
                profiles?.find(
                    function (item) {
                        return (
                            String(item.id) ===
                            String(application.user_id)
                        );
                    }
                );


                const fullName =
                    profile?.full_name ||
                    "Applicant";


                const location =
                    profile?.location ||
                    "Location not provided";


                const skills =
                    profile?.skills ||
                    "Skills not provided";


                // ================================
                // CARD HTML
                // ================================

                card.innerHTML = `

                    <div class="applicant-top">

                        <div>

                            <h3>
                                ${escapeHTML(
                                    fullName
                                )}
                            </h3>
                            <p class="rating-line" data-rating-user="${escapeHTML(application.user_id)}" hidden></p>

                            <p class="applicant-id">

                                Application ID:
                                ${escapeHTML(
                                    application.id
                                )}

                            </p>

                        </div>


                        <span
                            class="application-status status-${escapeHTML(
                                status
                            )}"
                        >

                            ${escapeHTML(
                                status
                            )}

                        </span>

                    </div>


                    <div class="applicant-profile">

                        <p>

                            <strong>
                                📍 Location:
                            </strong>

                            ${escapeHTML(
                                location
                            )}

                        </p>


                        <p>

                            <strong>
                                🛠️ Skills:
                            </strong>

                            ${escapeHTML(
                                skills
                            )}

                        </p>

                    </div>


                    <div class="applicant-message">

    <strong>
        Application Message
    </strong>

    <p>
        ${escapeHTML(
            application.cover_message ||
            "No message provided."
        )}
    </p>

</div>

<div
    class="application-attachments"
    data-application-id="${escapeHTML(application.id)}"
>
    <strong>Attachments</strong>

    <p class="attachment-loading">
        Checking for attachments...
    </p>
</div>


                    <p class="application-date">

                        Applied:

                        ${new Date(
                            application.created_at
                        ).toLocaleDateString()}

                    </p>


                    
<div class="applicant-actions">

<a
    class="btn btn-ghost btn-sm"
    href="worker-profile.html?id=${encodeURIComponent(application.user_id)}"
>
    View Worker Profile
</a>


    ${
        status === "pending"
        ? `
            <button
                class="accept-applicant"
                data-application-id="${escapeHTML(application.id)}"
            >
                Accept
            </button>

            <button
                class="reject-applicant"
                data-application-id="${escapeHTML(application.id)}"
            >
                Reject
            </button>
        `
        : ""
    }

    ${
        status === "accepted"
        ? `
        
<button
    class="message-worker-btn"
    data-application-id="${escapeHTML(application.id)}"
    data-worker-id="${escapeHTML(application.user_id)}"
>
    Message Worker
</button>

            <div class="worker-completion-status">

                ${
                    application.completed_at
                    ? `
                        <p>
                            ✓ Work completed and confirmed
                        </p>
                    `
                    : application.job_seeker_completed_at
                    ? `
                        <p>
                            Worker marked the work as completed.
                        </p>

                        ${
                            !application.client_completed_at
                            ? `
                                <button
                                    class="confirm-worker-completion"
                                    data-application-id="${escapeHTML(application.id)}"
                                >
                                    Confirm Completion
                                </button>
                            `
                            : ""
                        }
                    `
                    : `
                        <p>
                            Waiting for the worker to mark the work as completed.
                        </p>
                    `
                }

            </div>
        `
        : ""
    }

</div>

                `;


                applicantsContainer.appendChild(
                    card
                );

                
                // ================================
                // LOAD APPLICATION ATTACHMENTS
                // ================================

                (async function () {

                    const attachmentsContainer =
                        card.querySelector(
                            ".application-attachments"
                        );

                    if (!attachmentsContainer) {
                        return;
                    }

                    const { data: attachments, error: attachmentsError } =
                        await supabaseClient
                            .from("application_attachments")
                            .select(`
                                id,
                                original_filename,
                                mime_type,
                                file_size,
                                storage_path
                            `)
                            .eq(
                                "application_id",
                                application.id
                            )
                            .order("created_at", {
                                ascending: true
                            });

                    if (attachmentsError) {
                        console.error(
                            "Attachment loading error:",
                            attachmentsError
                        );

                        attachmentsContainer.textContent =
                            "Attachments could not be loaded.";
                        return;
                    }

                    if (!attachments || attachments.length === 0) {
                        attachmentsContainer.textContent =
                            "No attachments provided.";
                        return;
                    }

                    const attachmentList =
                        document.createElement("ul");

                    attachmentList.className =
                        "application-attachment-list";

                    for (const attachment of attachments) {

                        const listItem =
                            document.createElement("li");

                        const fileLink =
                            document.createElement("a");

                        fileLink.textContent =
                            attachment.original_filename;

                        fileLink.href = "#";
                        fileLink.className =
                            "application-attachment-link";

                        fileLink.addEventListener(
                            "click",
                            async function (event) {

                                event.preventDefault();

                                fileLink.textContent =
                                    "Preparing secure link...";

                                fileLink.style.pointerEvents =
                                    "none";

                                const {
                                    data: signedFile,
                                    error: signedUrlError
                                } = await supabaseClient.storage
                                    .from("application-attachments")
                                    .createSignedUrl(
                                        attachment.storage_path,
                                        300,
                                        {
                                            download:
                                                attachment.original_filename
                                        }
                                    );

                                if (signedUrlError || !signedFile?.signedUrl) {

                                    console.error(
                                        "Signed URL error:",
                                        signedUrlError
                                    );

                                    fileLink.textContent =
                                        attachment.original_filename +
                                        " (could not open file)";

                                    fileLink.style.pointerEvents =
                                        "auto";

                                    return;
                                }

                                window.open(
                                    signedFile.signedUrl,
                                    "_blank",
                                    "noopener,noreferrer"
                                );

                                fileLink.textContent =
                                    attachment.original_filename;

                                fileLink.style.pointerEvents =
                                    "auto";
                            }
                        );

                        const fileDetails =
                            document.createElement("span");

                        const fileSizeKB =
                            (attachment.file_size / 1024)
                                .toFixed(1);

                        fileDetails.textContent =
                            " (" + fileSizeKB + " KB)";

                        listItem.appendChild(fileLink);
                        listItem.appendChild(fileDetails);

                        attachmentList.appendChild(listItem);
                    }

                    attachmentsContainer.innerHTML = "";

                    const attachmentsHeading =
                        document.createElement("strong");

                    attachmentsHeading.textContent =
                        "Attachments";

                    attachmentsContainer.appendChild(
                        attachmentsHeading
                    );

                    attachmentsContainer.appendChild(
                        attachmentList
                    );

                })().catch(function (error) {

                    console.error(
                        "Unexpected attachment error:",
                        error
                    );

                    const container =
                        card.querySelector(
                            ".application-attachments"
                        );

                    if (container) {
                        container.textContent =
                            "Attachments could not be loaded.";
                    }

                });


                    const messageApplicantButton =
    card.querySelector(
        ".message-worker-btn"
    );

                if (messageApplicantButton) {
                    messageApplicantButton.addEventListener(
                        "click",
                        function () {
                            openAcceptedApplicationConversation(
                                application.id
                            );
                        }
                    );
                }

            }
        );


        fillRatings(applicantsContainer);
        // ================================
        // ACCEPT BUTTONS
        // ================================

        document
            .querySelectorAll(
                ".accept-applicant"
            )
            .forEach(
                function (button) {

                    button.addEventListener(
                        "click",
                        function () {

                            updateApplicationStatus(
                                button.dataset.applicationId,
                                "accepted"
                            );

                        }
                    );

                }
            );


        // ================================
        // REJECT BUTTONS
        // ================================

        document
            .querySelectorAll(
                ".reject-applicant"
            )
            .forEach(
                function (button) {

                    button.addEventListener(
                        "click",
                        function () {

                            updateApplicationStatus(
                                button.dataset.applicationId,
                                "rejected"
                            );

                        }
                    );

                }
            );

            // ================================
        // CONFIRM WORKER COMPLETION
        // ================================

        document
            .querySelectorAll(
                ".confirm-worker-completion"
            )
            .forEach(function (button) {

                button.addEventListener(
                    "click",
                    async function () {

                        const applicationId =
                            button.dataset.applicationId;

                        const confirmed = confirm(
                            "Confirm that this worker has completed the job?"
                        );

                        if (!confirmed) {
                            return;
                        }

                        button.disabled = true;
                        button.textContent = "Confirming...";

                        try {

                            const { error } =
                                await supabaseClient.rpc(
                                    "confirm_application_work_completed",
                                    {
                                        p_application_id: applicationId
                                    }
                                );

                            if (error) {
                                throw error;
                            }

                            alert(
                                "Work completion confirmed successfully!"
                            );

                            window.location.reload();

                        } catch (error) {

                            console.error(
                                "Completion confirmation error:",
                                error
                            );

                            alert(
                                error.message ||
                                "Could not confirm completion. Please try again."
                            );

                            button.disabled = false;
                            button.textContent =
                                "Confirm Completion";
                        }

                    }
                );

            });

    }

    catch (error) {

        console.error(
            "Applicants error:",
            error
        );

        applicantsContainer.innerHTML = `
            <p>
                Something went wrong while loading applicants.
            </p>
        `;

    }

}

// ========================================
// UPDATE APPLICATION STATUS
// ========================================

async function updateApplicationStatus(
    applicationId,
    newStatus
) {

    const confirmed =
        confirm(
            `Are you sure you want to mark this application as ${newStatus}?`
        );


    if (!confirmed) {
        return;
    }


    try {

// ========================================
// UPDATE APPLICATION SECURELY
// ========================================

const {
    error: applicationError
} = await supabaseClient.rpc(
    "client_update_application_status",
    {
        p_application_id: applicationId,
        p_status: newStatus
    }
);

if (applicationError) {

    console.error(
        "Application update error:",
        applicationError
    );

    alert(
        "Could not update the application: " +
        applicationError.message
    );

    return;
}


        // ========================================
        // SUCCESS MESSAGE
        // ========================================

        if (newStatus === "accepted") {

            alert(
                "Applicant accepted! The job is now in progress."
            );

        }

        else {

            alert(
                "Application marked as rejected."
            );

        }


        // ========================================
        // RELOAD APPLICANTS
        // ========================================

        loadApplicants();

    }


    catch (error) {

        console.error(
            "Status update error:",
            error
        );

        alert(
            "Something went wrong. Please try again."
        );

    }


}

// Automatically load applicants when the page opens
    loadApplicants();
    
}

/* ========================================
   JOB COMPLETION STATUS
   Completion is confirmed per worker
   in the employer's Applicants page.
======================================== */

const jobCompletionContainer =
    document.getElementById(
        "job-completion-container"
    );

if (jobCompletionContainer) {

    async function loadJobCompletion() {

        const params =
            new URLSearchParams(
                window.location.search
            );

        const jobId = params.get("id");

        if (!jobId) {
            return;
        }

        try {

            const {
                data: { user },
                error: userError
            } = await supabaseClient.auth.getUser();

            if (userError || !user) {
                return;
            }

            const {
                data: job,
                error
            } = await supabaseClient
                .from("jobs")
                .select("id, user_id, status")
                .eq("id", jobId)
                .single();

            if (error || !job) {
                return;
            }

            // Only show this information to the job owner.
            if (job.user_id !== user.id) {
                return;
            }

            if (job.status === "completed") {

                jobCompletionContainer.innerHTML = `
                    <div class="job-completed-message">
                        ✓ This job has been completed.
                    </div>
                `;

                return;
            }

            if (job.status !== "in_progress") {
                return;
            }

            jobCompletionContainer.innerHTML = `
                <div class="complete-job-card">
                    <h2>Confirm Work Completion</h2>

                    <p>
                        Workers mark their own work as completed
                        from My Applications. Review and confirm
                        each worker individually on your Applicants
                        page. The job will be marked completed
                        automatically after all accepted workers
                        have been confirmed.
                    </p>
                </div>
            `;

        } catch (error) {

            console.error(
                "Job completion status error:",
                error
            );

        }
    }

    loadJobCompletion();
}

// ========================================
// RATINGS & REVIEWS
// Uses the "reviews" table and the
// "profile_ratings" view (see sql/01-reviews.sql).
// ========================================

// Turns 4 into "★★★★☆".
function starsText(rating) {
    const full = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    return "★".repeat(full) + "☆".repeat(5 - full);
}

function formatReviewDate(value) {
    const date = new Date(value);
    if (isNaN(date)) {
        return "";
    }
    return date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

// Fills every [data-rating-user] element inside "root"
// with that person's average rating, e.g. "★ 4.8 (12 reviews)".
// If the reviews tables are not set up yet, the labels are removed quietly.
async function fillRatings(root) {
    if (!root) {
        return;
    }
    const slots = Array.from(root.querySelectorAll("[data-rating-user]"));
    if (!slots.length) {
        return;
    }
    const ids = Array.from(new Set(
        slots.map(function (slot) { return slot.dataset.ratingUser; }).filter(Boolean)
    ));
    const { data, error } = await supabaseClient
        .from("profile_ratings")
        .select("user_id, average_rating, review_count")
        .in("user_id", ids);
    if (error) {
        console.error("Ratings error:", error);
        slots.forEach(function (slot) { slot.remove(); });
        return;
    }
    const byUser = {};
    (data || []).forEach(function (row) {
        byUser[row.user_id] = row;
    });
    slots.forEach(function (slot) {
        const row = byUser[slot.dataset.ratingUser];
        const label = slot.dataset.ratingLabel
            ? escapeHTML(slot.dataset.ratingLabel) + ": "
            : "";
        if (!row) {
            slot.innerHTML = label + `<span class="rating-count">No reviews yet</span>`;
        } else {
            const average = Number(row.average_rating).toFixed(1);
            const count = Number(row.review_count);
            slot.innerHTML = label +
                `<span class="rating-star" aria-hidden="true">★</span> ` +
                `<strong>${average}</strong> ` +
                `<span class="rating-count">(${count} ${count === 1 ? "review" : "reviews"})</span>`;
            slot.setAttribute(
                "aria-label",
                `Rated ${average} out of 5 from ${count} ${count === 1 ? "review" : "reviews"}`
            );
        }
        slot.hidden = false;
    });
}

// ----------------------------------------
// Leave a review (job page, after completion)
// ----------------------------------------
const jobReviewContainer = document.getElementById("job-review-container");

function reviewFormHTML(index, targetId, name) {
    const stars = [5, 4, 3, 2, 1].map(function (n) {
        return `
            <input type="radio" id="star-${index}-${n}" name="rating" value="${n}">
            <label for="star-${index}-${n}"><span class="sr-only">${n} ${n === 1 ? "star" : "stars"}</span></label>`;
    }).join("");
    return `
        <form class="review-form card" data-reviewee="${escapeHTML(targetId)}">
            <h2>How was working with ${escapeHTML(name)}?</h2>
            <fieldset class="star-input">
                <legend class="sr-only">Your rating</legend>
                ${stars}
            </fieldset>
            <div class="field">
                <label for="review-comment-${index}">Comment (optional)</label>
                <textarea id="review-comment-${index}" name="comment" rows="3" maxlength="500"
                    placeholder="Was the work on time? Was communication clear?"></textarea>
                <small>Your review is public and cannot be edited later.</small>
            </div>
            <button type="submit" class="btn btn-yellow">Submit review</button>
            <p class="form-message" role="status" aria-live="polite"></p>
        </form>`;
}

async function loadJobReview() {
    if (!jobReviewContainer) {
        return;
    }
    const jobId = new URLSearchParams(window.location.search).get("id");
    if (!jobId) {
        return;
    }
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) {
            return;
        }
        jobReviewContainer.dataset.userId = user.id;

        const { data: job, error: jobError } = await supabaseClient
            .from("jobs")
            .select("id, user_id, status")
            .eq("id", jobId)
            .single();
        if (jobError || !job || job.status !== "completed") {
            jobReviewContainer.innerHTML = "";
            return;
        }

        // Who can this person review? Employer -> accepted workers. Worker -> the employer.
        const { data: accepted } = await supabaseClient
            .from("applications")
            .select("user_id")
            .eq("job_id", jobId)
            .eq("status", "accepted");
        const acceptedIds = (accepted || []).map(function (row) { return row.user_id; });

        let targets = [];
        if (job.user_id === user.id) {
            targets = acceptedIds;
        } else if (acceptedIds.indexOf(user.id) !== -1) {
            targets = [job.user_id];
        }
        if (!targets.length) {
            jobReviewContainer.innerHTML = "";
            return;
        }

        const { data: mine } = await supabaseClient
            .from("reviews")
            .select("reviewee_id, rating, comment")
            .eq("job_id", jobId)
            .eq("reviewer_id", user.id);
        const { data: people } = await supabaseClient
            .from("profiles")
            .select("id, full_name")
            .in("id", targets);

        const nameOf = function (id) {
            const person = (people || []).find(function (p) { return String(p.id) === String(id); });
            return (person && person.full_name) || "this person";
        };

        let html = "";
        targets.forEach(function (targetId, index) {
            const done = (mine || []).find(function (r) { return String(r.reviewee_id) === String(targetId); });
            if (done) {
                html += `
                    <div class="review-done card">
                        <p>You rated <strong>${escapeHTML(nameOf(targetId))}</strong></p>
                        <p class="review-stars" aria-label="${Number(done.rating)} out of 5">${starsText(done.rating)}</p>
                        ${done.comment ? `<p class="muted">${escapeHTML(done.comment)}</p>` : ""}
                    </div>`;
            } else {
                html += reviewFormHTML(index, targetId, nameOf(targetId));
            }
        });
        jobReviewContainer.innerHTML = html;
    } catch (error) {
        console.error("Review load error:", error);
    }
}

if (jobReviewContainer) {
    jobReviewContainer.addEventListener("submit", async function (event) {
        const form = event.target.closest("form.review-form");
        if (!form) {
            return;
        }
        event.preventDefault();

        const message = form.querySelector(".form-message");
        const button = form.querySelector("button[type='submit']");
        const chosen = form.querySelector("input[name='rating']:checked");
        if (!chosen) {
            message.textContent = "Please choose a star rating.";
            return;
        }

        const jobId = new URLSearchParams(window.location.search).get("id");
        const comment = form.elements.comment.value.trim();

        button.disabled = true;
        button.textContent = "Submitting...";
        const { error } = await supabaseClient.from("reviews").insert({
            job_id: jobId,
            reviewer_id: jobReviewContainer.dataset.userId,
            reviewee_id: form.dataset.reviewee,
            rating: Number(chosen.value),
            comment: comment || null
        });
        if (error) {
            console.error("Review save error:", error);
            message.textContent = error.code === "23505"
                ? "You have already reviewed this job."
                : "Could not save your review. Please try again.";
            button.disabled = false;
            button.textContent = "Submit review";
            return;
        }
        loadJobReview();
    });
    loadJobReview();
}

// ----------------------------------------
// Reviews you have received (profile page)
// ----------------------------------------
const profileReviewsContainer = document.getElementById("profile-reviews");
if (profileReviewsContainer) {
    (async function loadMyReviews() {
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) {
                return;
            }
            const { data: reviews, error } = await supabaseClient
                .from("reviews")
                .select("id, reviewer_id, rating, comment, created_at")
                .eq("reviewee_id", user.id)
                .order("created_at", { ascending: false })
                .limit(20);
            if (error) {
                console.error("Reviews error:", error);
                profileReviewsContainer.innerHTML = "";
                return;
            }
            if (!reviews || !reviews.length) {
                profileReviewsContainer.innerHTML = `
                    <div class="empty">
                        <p>No reviews yet. They appear here after a job you worked on is completed.</p>
                    </div>`;
                return;
            }
            const reviewerIds = Array.from(new Set(reviews.map(function (r) { return r.reviewer_id; })));
            const { data: people } = await supabaseClient
                .from("profiles")
                .select("id, full_name")
                .in("id", reviewerIds);
            const average = reviews.reduce(function (sum, r) { return sum + Number(r.rating); }, 0) / reviews.length;
            const list = reviews.map(function (review) {
                const person = (people || []).find(function (p) { return String(p.id) === String(review.reviewer_id); });
                return `
                    <article class="review-item">
                        <div class="review-top">
                            <a class="name-link" href="worker.html?id=${encodeURIComponent(review.reviewer_id)}"><strong>${escapeHTML((person && person.full_name) || "NaijaJobs member")}</strong></a>
                            <span class="review-stars" aria-label="${Number(review.rating)} out of 5">${starsText(review.rating)}</span>
                        </div>
                        ${review.comment ? `<p>${escapeHTML(review.comment)}</p>` : ""}
                        <time>${escapeHTML(formatReviewDate(review.created_at))}</time>
                    </article>`;
            }).join("");
            profileReviewsContainer.innerHTML = `
                <p class="review-summary">
                    <span class="rating-star" aria-hidden="true">★</span>
                    <strong>${average.toFixed(1)}</strong> average from ${reviews.length} ${reviews.length === 1 ? "review" : "reviews"}
                </p>
                ${list}`;
        } catch (error) {
            console.error("Reviews load error:", error);
        }
    })();
}

// ========================================
// NOTIFICATIONS
// Uses the "notifications" table (see sql/02-notifications.sql).
// The database creates them; the browser only reads them
// and marks them as read.
// ========================================

// Links come from the database, but only ever follow our own pages.
function safeNotificationLink(link) {
    return /^[a-z0-9-]+\.html(\?[A-Za-z0-9_=&%.-]*)?$/i.test(link || "")
        ? link
        : "dashboard.html";
}

function timeAgo(value) {
    const then = new Date(value).getTime();
    if (isNaN(then)) {
        return "";
    }
    const minutes = Math.floor(Math.max(0, Date.now() - then) / 60000);
    if (minutes < 1) {
        return "Just now";
    }
    if (minutes < 60) {
        return minutes + (minutes === 1 ? " minute ago" : " minutes ago");
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return hours + (hours === 1 ? " hour ago" : " hours ago");
    }
    const days = Math.floor(hours / 24);
    if (days < 7) {
        return days + (days === 1 ? " day ago" : " days ago");
    }
    return formatReviewDate(value);
}

// Updates the badge in the menu (and the dot on the phone menu button).
function showUnreadCount(count) {
    const badge = document.getElementById("nav-unread");
    const dot = document.getElementById("nav-unread-dot");
    if (badge) {
        badge.textContent = count > 99 ? "99+" : String(count);
        badge.setAttribute("aria-label", count + " unread");
        badge.hidden = count < 1;
    }
    if (dot) {
        dot.hidden = count < 1;
    }
}


async function loadUnreadCount() {
    const notificationBadge = document.getElementById("notifications-unread-badge");
    const navBadge = document.getElementById("nav-unread");

    if (!notificationBadge && !navBadge) {
        return 0;
    }

    const { count, error } = await supabaseClient
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false);

    if (error) {
        console.error("Unread count error:", error);
        return 0;
    }

    const unreadCount = count || 0;

    if (notificationBadge) {
        notificationBadge.textContent = unreadCount;
        notificationBadge.hidden = unreadCount === 0;
        notificationBadge.setAttribute(
            "aria-label",
            `${unreadCount} unread notifications`
        );
    }

    if (navBadge) {
        showUnreadCount(unreadCount);
    }

    return unreadCount;
}


const notificationsContainer = document.getElementById("notifications-container");

async function loadNotifications() {
    if (!notificationsContainer) {
        return;
    }
    const markAll = document.getElementById("mark-all-read");
    const { data, error } = await supabaseClient
        .from("notifications")
        .select("id, title, body, link, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
    if (error) {
        console.error("Notifications error:", error);
        notificationsContainer.innerHTML = `<p class="muted">Could not load notifications.</p>`;
        return;
    }
    if (!data || !data.length) {
        notificationsContainer.innerHTML = `
            <div class="empty">
                <h2>You're all caught up</h2>
                <p>When something happens with your applications or jobs, you'll see it here.</p>
                <a href="dashboard.html" class="btn btn-ghost btn-sm">Back to dashboard</a>
            </div>`;
        if (markAll) {
            markAll.hidden = true;
        }
        return;
    }
    const items = data.map(function (item) {
        const unread = !item.is_read;
        return `
            <li>
                <a class="notif${unread ? " notif-unread" : ""}"
                   href="${escapeHTML(safeNotificationLink(item.link))}"
                   data-id="${escapeHTML(item.id)}">
                    <span class="notif-dot" aria-hidden="true"></span>
                    <span class="notif-text">
                        <strong>${unread ? '<span class="sr-only">Unread: </span>' : ""}${escapeHTML(item.title)}</strong>
                        <span>${escapeHTML(item.body)}</span>
                        <time>${escapeHTML(timeAgo(item.created_at))}</time>
                    </span>
                </a>
            </li>`;
    }).join("");
    notificationsContainer.innerHTML = `<ul class="notif-list">${items}</ul>`;
    if (markAll) {
        markAll.hidden = !data.some(function (item) { return !item.is_read; });
    }
}

if (notificationsContainer) {
    // Opening an unread notification marks it read, then goes to the page.
    notificationsContainer.addEventListener("click", async function (event) {
        const item = event.target.closest("a.notif");
        if (!item || !item.classList.contains("notif-unread")) {
            return;
        }
        event.preventDefault();
        const { error } = await supabaseClient
            .from("notifications")
            .update({ is_read: true })
            .eq("id", item.dataset.id);
        if (error) {
            console.error("Mark read error:", error);
        }
        window.location.href = item.getAttribute("href");
    });

    const markAllButton = document.getElementById("mark-all-read");
    if (markAllButton) {
        markAllButton.addEventListener("click", async function () {
            markAllButton.disabled = true;
            const { error } = await supabaseClient
                .from("notifications")
                .update({ is_read: true })
                .eq("is_read", false);
            if (error) {
                console.error("Mark all read error:", error);
            }
            markAllButton.disabled = false;
            await loadNotifications();
            await loadUnreadCount();
        });
    }
    loadNotifications();
}

// On every page with the menu: show the unread count and keep it live.
(async function startNotificationBadge() {    
    if (
        !document.getElementById("nav-unread") &&
        !document.getElementById("notifications-unread-badge")
    ) {
        return;
    }

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) {
            return;
        }
        await loadUnreadCount();
        supabaseClient
            .channel("notifications-" + user.id)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "notifications",
                    filter: "user_id=eq." + user.id
                },
                function () {
                    loadUnreadCount();
                    loadNotifications();
                }
            )
            .subscribe();
    } catch (error) {
        console.error("Notification badge error:", error);
    }
})();

// ========================================
// GROWTH TOOLS
// Sharing, reporting, public profiles, email
// preference, featured jobs and the admin
// report queue.
// Needs: sql/03 to sql/06 (each feature switches on
// when its SQL has been run; until then it stays hidden).
// ========================================

// ---------- Sharing (WhatsApp, copy link, phone share sheet) ----------
function jobPageUrl(job) {
    return new URL("job.html?id=" + encodeURIComponent(job.id), window.location.href).href;
}

function jobShareSummary(job) {
    return "*" + job.title + "*\n" +
        "\u20A6" + Number(job.budget).toLocaleString() + " \u00B7 " +
        job.location + " (" + job.job_type + ")";
}

function jobShareText(job) {
    return jobShareSummary(job) + "\nApply on NaijaJobs: " + jobPageUrl(job);
}

function whatsappShareUrl(job) {
    return "https://wa.me/?text=" + encodeURIComponent(jobShareText(job));
}

// A small chat-bubble icon for the Share buttons.
function whatsappIcon() {
    return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
}

// Called by the job page once the job has been drawn.
async function wireJobPageTools(job, viewer) {
    const copyButton = document.getElementById("copy-job-link");
    const shareButton = document.getElementById("native-share");
    const reportButton = document.getElementById("report-job");

    if (copyButton) {
        copyButton.addEventListener("click", async function () {
            try {
                await navigator.clipboard.writeText(jobPageUrl(job));
                copyButton.textContent = "Link copied";
            } catch (error) {
                window.prompt("Copy this link:", jobPageUrl(job));
            }
            setTimeout(function () { copyButton.textContent = "Copy link"; }, 2000);
        });
    }
    if (shareButton && navigator.share) {
        shareButton.hidden = false;
        shareButton.addEventListener("click", function () {
            navigator.share({
                title: job.title,
                text: jobShareSummary(job),
                url: jobPageUrl(job)
            }).catch(function () { /* person closed the share sheet */ });
        });
    }
    if (reportButton) {
        reportButton.addEventListener("click", function () {
            reportButton.hidden = true;
            openReportForm(document.getElementById("report-box"), "job", job.id);
        });
    }

    // "Posted by <name>" is shown to signed-in visitors only.
    if (viewer && job.user_id) {
        const { data: poster } = await supabaseClient
            .from("profiles")
            .select("full_name")
            .eq("id", job.user_id)
            .maybeSingle();
        const line = document.querySelector(".poster-line");
        if (line && poster && poster.full_name) {
            line.innerHTML = `Posted by <a class="text-link" href="worker.html?id=${encodeURIComponent(job.user_id)}">${escapeHTML(poster.full_name)}</a>`;
            line.hidden = false;
        }
    }
}

// ---------- Reporting a job or a person ----------
async function openReportForm(host, targetType, targetId) {
    if (!host) {
        return;
    }
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        window.location.href = "login.html?next=" +
            encodeURIComponent(window.location.pathname.split("/").pop() + window.location.search);
        return;
    }
    const reasons = [
        ["payment", "Asks for money or a fee"],
        ["fake", "Fake or misleading"],
        ["inappropriate", "Inappropriate content"],
        ["spam", "Spam"],
        ["other", "Something else"]
    ];
    const options = reasons.map(function (r) {
        return `<option value="${r[0]}">${r[1]}</option>`;
    }).join("");
    host.innerHTML = `
        <form class="report-form card">
            <h3>Report this ${targetType === "job" ? "job" : "person"}</h3>
            <div class="field">
                <label for="report-reason">What is wrong?</label>
                <select id="report-reason" name="reason" required>
                    <option value="">Choose a reason</option>
                    ${options}
                </select>
            </div>
            <div class="field">
                <label for="report-details">Details (optional)</label>
                <textarea id="report-details" name="details" rows="3" maxlength="1000"
                    placeholder="Tell us what happened"></textarea>
            </div>
            <div class="report-actions">
                <button type="submit" class="btn btn-sm">Send report</button>
                <button type="button" class="btn btn-ghost btn-sm" data-cancel>Cancel</button>
            </div>
            <p class="form-message" role="status" aria-live="polite"></p>
        </form>`;
    const form = host.querySelector("form");
    const message = form.querySelector(".form-message");

    form.querySelector("[data-cancel]").addEventListener("click", function () {
        host.innerHTML = "";
        document.querySelectorAll(".report-link").forEach(function (b) { b.hidden = false; });
    });

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        const submit = form.querySelector("button[type='submit']");
        submit.disabled = true;
        const { error } = await supabaseClient.from("reports").insert({
            reporter_id: user.id,
            target_type: targetType,
            target_id: String(targetId),
            reason: form.elements.reason.value,
            details: form.elements.details.value.trim() || null
        });
        if (error && error.code !== "23505") {
            console.error("Report error:", error);
            message.textContent = "Could not send your report. Please try again.";
            submit.disabled = false;
            return;
        }
        host.innerHTML = `<p class="report-thanks">${error ? "You have already reported this. " : ""}Thank you. Our team will review it.</p>`;
    });
}

// ---------- Public profile page (worker.html) ----------
function skillChipsHTML(skills) {
    const list = Array.isArray(skills) ? skills : String(skills || "").split(",");
    const chips = list
        .map(function (item) { return String(item).trim(); })
        .filter(Boolean)
        .slice(0, 20)
        .map(function (item) { return `<li>${escapeHTML(item)}</li>`; })
        .join("");
    return chips ? `<ul class="chip-list">${chips}</ul>` : `<p class="muted">No skills listed yet.</p>`;
}

async function loadReviewsInto(container, userId) {
    const { data: reviews, error } = await supabaseClient
        .from("reviews")
        .select("id, reviewer_id, rating, comment, created_at")
        .eq("reviewee_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
    if (error) {
        container.innerHTML = `<p class="muted">Could not load reviews.</p>`;
        return;
    }
    if (!reviews || !reviews.length) {
        container.innerHTML = `<div class="empty"><p>No reviews yet.</p></div>`;
        return;
    }
    const reviewerIds = Array.from(new Set(reviews.map(function (r) { return r.reviewer_id; })));
    const { data: people } = await supabaseClient
        .from("profiles")
        .select("id, full_name")
        .in("id", reviewerIds);
    container.innerHTML = reviews.map(function (review) {
        const person = (people || []).find(function (p) { return String(p.id) === String(review.reviewer_id); });
        return `
            <article class="review-item">
                <div class="review-top">
                    <a class="name-link" href="worker.html?id=${encodeURIComponent(review.reviewer_id)}"><strong>${escapeHTML((person && person.full_name) || "NaijaJobs member")}</strong></a>
                    <span class="review-stars" aria-label="${Number(review.rating)} out of 5">${starsText(review.rating)}</span>
                </div>
                ${review.comment ? `<p>${escapeHTML(review.comment)}</p>` : ""}
                <time>${escapeHTML(formatReviewDate(review.created_at))}</time>
            </article>`;
    }).join("");
}

const workerProfileContainer = document.getElementById("worker-profile");
if (workerProfileContainer) {
    (async function loadWorkerProfile() {
        const profileId = new URLSearchParams(window.location.search).get("id");
        if (!profileId) {
            workerProfileContainer.innerHTML = `<div class="empty"><h2>Profile not found</h2><a class="btn btn-ghost btn-sm" href="browse.html">Find jobs</a></div>`;
            return;
        }
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            // Always load the safe public fields through the RPC. This works for
            // logged-out visitors and for signed-in visitors who are not connected
            // to the profile through an application. It does not expose email or
            // other private profile columns.
            const { data: publicProfile, error: publicProfileError } = await supabaseClient
                .rpc("get_public_profile", { p_profile_id: profileId });
            if (publicProfileError) {
                console.error("Public profile lookup error:", publicProfileError);
                workerProfileContainer.innerHTML = `<div class="empty"><h2>Public profiles are not configured yet</h2><p>Please try again later.</p><a class="btn btn-ghost btn-sm" href="browse.html">Find jobs</a></div>`;
                return;
            }
            let profile = publicProfile || null;
            let completed = profile
                ? Number(profile.jobs_done_as_worker || 0) + Number(profile.jobs_done_as_client || 0)
                : null;

            // The picture bucket is private. Only try to fetch its path for signed-in
            // users who already have permission to view that profile row.
            if (user && profile) {
                const { data: privateProfile } = await supabaseClient
                    .from("profiles")
                    .select("profile_picture_path")
                    .eq("id", profileId)
                    .maybeSingle();
                if (privateProfile) profile.profile_picture_path = privateProfile.profile_picture_path;
            }

            if (!profile) {
                workerProfileContainer.innerHTML = `<div class="empty"><h2>Profile not found</h2><a class="btn btn-ghost btn-sm" href="browse.html">Find jobs</a></div>`;
                return;
            }
            const name = profile.full_name || "NaijaJobs member";
            const isSelf = Boolean(user && user.id === profile.id);
            const role = profile.account_type === "client" ? "Client" : "Job seeker";

            
            // Check Premium access for the profile being viewed.
            let hasActiveWorkerPremium = false;

            if (
                ["worker", "job_seeker"].includes(profile.account_type)
            ) {
                const {
                    data: premiumSubscription,
                    error: premiumSubscriptionError
                } = await supabaseClient
                    .from("worker_premium_subscriptions")
                    .select("plan_type, status, expires_at")
                    .eq("user_id", profile.id)
                    .maybeSingle();

                if (!premiumSubscriptionError && premiumSubscription) {
                    hasActiveWorkerPremium =
                        premiumSubscription.status === "active" &&
                        (
                            premiumSubscription.plan_type === "lifetime"
                                ? premiumSubscription.expires_at === null
                                : premiumSubscription.expires_at !== null &&
                                  new Date(premiumSubscription.expires_at).getTime() > Date.now()
                        );
                }
            }


            workerProfileContainer.innerHTML = `
                ${isSelf ? `<p class="notice-inline">This is how other people see your profile. <a class="text-link" href="profile.html">Edit profile</a></p>` : ""}
                <div class="worker-head">
                    <div class="avatar worker-avatar">
                        <img id="worker-photo" alt="" hidden>
                        <span id="worker-letter">${escapeHTML(name.charAt(0).toUpperCase())}</span>
                    </div>
                    
<div>
    <div class="profile-name-row">
        <h1>${escapeHTML(name)}</h1>
        ${hasActiveWorkerPremium ? '<span class="worker-premium-badge">✦ PREMIUM</span>' : ""}
    </div>
    <p class="muted">${role}${profile.location ? " · " + escapeHTML(profile.location) : ""}</p>
    <p class="rating-line" data-rating-user="${escapeHTML(profile.id)}" hidden></p>
</div>

                </div>
                ${completed !== null ? `
                <div class="stats stats-2">
                    <div class="stat"><h3>${completed}</h3><p>Jobs completed</p></div>
                </div>` : ""}
                <section class="card worker-section">
                    <h2>About</h2>
                    <p>${profile.bio ? escapeHTML(profile.bio) : '<span class="muted">No bio yet.</span>'}</p>
                </section>
                <section class="card worker-section">
                    <h2>Skills</h2>
                    ${skillChipsHTML(profile.skills)}
                </section>
                <h2 class="section-title">Reviews</h2>
                <div id="worker-reviews" class="profile-reviews">${user ? "" : '<p class="muted">Log in to view member reviews.</p>'}</div>
                ${!user || isSelf ? "" : `
                <div class="report-area">
                    <button type="button" class="report-link" id="report-user">Report this person</button>
                    <div id="report-box"></div>
                </div>`}`;

            document.title = name + " | NaijaJobs";
            fillRatings(workerProfileContainer);
            if (user) {
                loadReviewsInto(document.getElementById("worker-reviews"), profile.id);
            }

            const reportUser = document.getElementById("report-user");
            if (reportUser) {
                reportUser.addEventListener("click", function () {
                    reportUser.hidden = true;
                    openReportForm(document.getElementById("report-box"), "user", profile.id);
                });
            }

            // Photo lives in the private "profile-pictures" bucket, so ask for a temporary link.
            if (profile.profile_picture_path) {
                const { data: picture } = await supabaseClient
                    .storage
                    .from("profile-pictures")
                    .createSignedUrl(profile.profile_picture_path, 3600);
                const photo = document.getElementById("worker-photo");
                if (picture && picture.signedUrl && photo) {
                    photo.onload = function () {
                        photo.hidden = false;
                        document.getElementById("worker-letter").hidden = true;
                    };
                    photo.src = picture.signedUrl;
                }
            }
        } catch (error) {
            console.error("Profile view error:", error);
            workerProfileContainer.innerHTML = `<p class="muted">Could not load this profile.</p>`;
        }
    })();
}

// ---------- Profile page extras: public profile link + email alerts switch ----------
(async function setupProfileExtras() {
    const emailSwitch = document.getElementById("email-alerts");
    const publicLink = document.getElementById("view-public-profile");
    if (!emailSwitch && !publicLink) {
        return;
    }
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) {
            return;
        }
        if (publicLink) {
            publicLink.href = "worker-profile.html?id=" + encodeURIComponent(user.id);
        }
        if (!emailSwitch) {
            return;
        }
        const note = document.getElementById("email-alerts-message");
        const { data, error } = await supabaseClient
            .from("profiles")
            .select("email_alerts")
            .eq("id", user.id)
            .maybeSingle();
        const card = document.getElementById("email-alerts-card");
        if (error || !data) {
            // sql/05 has not been run yet: keep the switch hidden
            if (card) { card.hidden = true; }
            return;
        }
        emailSwitch.checked = data.email_alerts !== false;
        emailSwitch.addEventListener("change", async function () {
            const wanted = emailSwitch.checked;
            emailSwitch.disabled = true;
            const { error: saveError } = await supabaseClient
                .from("profiles")
                .update({ email_alerts: wanted })
                .eq("id", user.id);
            emailSwitch.disabled = false;
            if (saveError) {
                console.error("Email alert save error:", saveError);
                emailSwitch.checked = !wanted;
                note.textContent = "Could not save this setting. Please try again.";
                return;
            }
            note.textContent = wanted ? "Email alerts are on." : "Email alerts are off.";
        });
    } catch (error) {
        console.error("Profile extras error:", error);
    }
})();

// ---------- Featured jobs (my-jobs page) ----------
function featuredControlsHTML(job) {
    if (job.status !== "open") {
        return "";
    }
    const until = job.featured_until ? new Date(job.featured_until) : null;
    const active = until && !isNaN(until) && until.getTime() > Date.now();
    return `
        <div class="feature-box" data-job-id="${escapeHTML(job.id)}">
            ${active ? `<p class="feature-status"><span class="featured-badge">Featured</span> until ${escapeHTML(until.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }))}</p>` : ""}
            <button type="button" class="btn btn-ghost btn-sm feature-open">${active ? "Extend featuring" : "Feature this job"}</button>
            <div class="feature-panel" hidden></div>
        </div>`;
}

const FEATURE_PLANS = [
    { days: 7, price: 1500 }
];

function featurePanelHTML() {
    const plans = FEATURE_PLANS.map(function (plan, index) {
        return `
            <label class="plan-option">
                <input type="radio" name="feature-plan" value="${plan.days}" ${index === 0 ? "checked" : ""}>
                <span>
                    <strong>${plan.days} days</strong>
                    <span class="muted">\u20A6${plan.price.toLocaleString()}</span>
                </span>
            </label>`;
    }).join("");

    return `
        <p class="muted">
            Featured jobs appear at the top of Find jobs with a badge,
            helping more people see them.
        </p>

        <div class="subscription-feature-option">
            <p>
                <strong>Have featured-job credits?</strong>
            </p>
            <p class="muted">
                Use one credit to feature this job for 7 days.
                If it is already featured, the expiry will be extended by 7 days.
            </p>
            <button
                type="button"
                class="btn btn-sm feature-credit"
            >
                Use 1 subscription credit
            </button>
        </div>

        <hr>

        <p class="muted">Or purchase a featured promotion:</p>
        <fieldset class="plan-list">
            <legend class="sr-only">Choose how long</legend>
            ${plans}
        </fieldset>

        <button
            type="button"
            class="btn btn-yellow btn-sm feature-pay"
        >
            Pay with Paystack
        </button>

        <p class="form-message" role="status" aria-live="polite"></p>`;
}

async function startFeaturePayment(box) {
    const message = box.querySelector(".form-message");
    const payButton = box.querySelector(".feature-pay");
    const jobId = box.dataset.jobId;

    if (!message || !payButton || !jobId) {
        console.error("Featured payment elements or job ID are missing.");
        return;
    }

    payButton.disabled = true;
    message.textContent = "Preparing secure checkout...";

    try {
        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser();

        if (authError || !user) {
            window.location.href =
                "login.html?next=" +
                encodeURIComponent("my-jobs.html");
            return;
        }

        const { data, error } =
            await supabaseClient.functions.invoke(
                "initialize-featured-payment",
                {
                    body: { job_id: jobId }
                }
            );

        if (error || !data || !data.authorization_url) {
            console.error(
                "Featured payment initialization failed:",
                error || data
            );

            message.textContent =
                data?.error ||
                "Could not start payment. Please try again.";

            payButton.disabled = false;
            return;
        }

        message.textContent =
            "Opening secure Paystack checkout...";

        window.location.href = data.authorization_url;

    } catch (error) {
        console.error("Featured payment error:", error);

        message.textContent =
            "Something went wrong. Please try again.";

        payButton.disabled = false;
    }
}

async function startFeatureCredit(box) {
    const message = box.querySelector(".form-message");
    const creditButton = box.querySelector(".feature-credit");
    const jobId = box.dataset.jobId;

    if (!message || !creditButton || !jobId) {
        console.error("Featured-credit elements or job ID are missing.");
        return;
    }

    creditButton.disabled = true;
    message.textContent = "Applying your subscription credit...";

    try {
        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser();

        if (authError || !user) {
            window.location.href =
                "login.html?next=" +
                encodeURIComponent("my-jobs.html");
            return;
        }

        const { data, error } = await supabaseClient.rpc(
            "use_client_featured_credit",
            {
                p_job_id: jobId
            }
        );

        if (error || !data || data.success !== true) {
            console.error(
                "Subscription featured credit failed:",
                error || data
            );

            message.textContent =
                error?.message ||
                data?.message ||
                "Could not use your featured credit. Please try again.";

            creditButton.disabled = false;
            return;
        }

        const expiry = data.featured_until
            ? new Date(data.featured_until).toLocaleString()
            : "";

        message.textContent =
            "Job featured successfully! Credits remaining: " +
            data.credits_remaining +
            (expiry ? ". Featured until " + expiry + "." : "");

        await new Promise(function (resolve) {
            setTimeout(resolve, 800);
        });

        window.location.reload();

    } catch (error) {
        console.error("Subscription credit error:", error);

        message.textContent =
            "Something went wrong. Please refresh and check your job status.";

        creditButton.disabled = false;
    }
}



const featuredJobsList = document.getElementById("my-jobs-container");

if (featuredJobsList) {
    featuredJobsList.addEventListener("click", function (event) {
        const open = event.target.closest(".feature-open");
        const pay = event.target.closest(".feature-pay");
        const credit = event.target.closest(".feature-credit");

        if (open) {
            const panel = open.closest(".feature-box")
                .querySelector(".feature-panel");

            if (panel.hidden) {
                panel.innerHTML = featurePanelHTML();
                panel.hidden = false;
            } else {
                panel.hidden = true;
            }
        }

        if (pay) {
            startFeaturePayment(pay.closest(".feature-box"));
        }

        if (credit) {
            startFeatureCredit(credit.closest(".feature-box"));
        }
    });
}

// ---------- Featured job payment return ----------
const featuredPaymentParams = new URLSearchParams(
    window.location.search
);

const featuredPaymentReference =
    featuredPaymentParams.get("reference") ||
    featuredPaymentParams.get("trxref");

const featuredPaymentStatus =
    featuredPaymentParams.get("status");

if (
    document.getElementById("my-jobs-container") &&
    featuredPaymentReference &&
    featuredPaymentReference.startsWith("njf_")
) {
    (async function verifyFeaturedPaymentReturn() {
        const container = document.getElementById("my-jobs-container");

        const notice = document.createElement("div");
        notice.className = "notice-inline";
        notice.setAttribute("role", "status");
        notice.setAttribute("aria-live", "polite");
        notice.textContent = featuredPaymentStatus === "success"
            ? "Payment returned from Paystack. Verifying securely..."
            : "Checking your payment status...";

        container.prepend(notice);

        try {
            const {
                data: { user },
                error: authError
            } = await supabaseClient.auth.getUser();

            if (authError || !user) {
                notice.textContent =
                    "Please log in again to check your featured-job payment.";
                return;
            }

            console.log("Featured payment return detected:", featuredPaymentReference);
            console.log("Starting featured payment verification...");

            const { data, error } =
                await supabaseClient.functions.invoke(
                    "verify-featured-payment",
                    {
                        body: {
                            reference: featuredPaymentReference
                        }
                    }
                );

            if (error || !data || data.success !== true) {
                console.error(
                    "Featured payment verification failed:",
                    error || data
                );

                notice.textContent =
                    data?.message ||
                    data?.error ||
                    "We could not confirm this payment yet. Please refresh your jobs page or contact support. Reference: " +
                    featuredPaymentReference;

                return;
            }

            notice.textContent = data.already_processed
                ? "This payment was already confirmed. Your featured-job status is being refreshed."
                : "Payment verified! Your job has been featured for 7 days.";

            // Remove payment parameters so refreshing the page
            // does not repeatedly process the same return URL.
            window.history.replaceState(
                {},
                document.title,
                window.location.pathname
            );

            setTimeout(function () {
                window.location.reload();
            }, 1800);

        } catch (error) {
            console.error(
                "Featured payment return error:",
                error
            );

            notice.textContent =
                "We could not verify your payment right now. Please contact support with reference: " +
                featuredPaymentReference;
        }
    })();
}

/* ---------- Worker Premium payment return ---------- */
const workerPremiumParams = new URLSearchParams(
    window.location.search
);

const workerPremiumReference =
    workerPremiumParams.get("reference") ||
    workerPremiumParams.get("trxref");

if (
    (
        document.getElementById("my-jobs-container") ||
        document.getElementById("worker-account-plan")
    ) &&
    workerPremiumReference &&
    /^njwp_[0-9a-f-]{36}$/i.test(workerPremiumReference)
) {
    (async function verifyWorkerPremiumPaymentReturn() {
        const container =
    document.getElementById("my-jobs-container") ||
    document.getElementById("worker-account-plan");

        const notice = document.createElement("div");
        notice.className = "notice-inline";
        notice.setAttribute("role", "status");
        notice.setAttribute("aria-live", "polite");
        notice.textContent =
            "Verifying your Worker Premium payment securely...";

        container.prepend(notice);

        try {
            const {
                data: { user },
                error: authError
            } = await supabaseClient.auth.getUser();

            if (authError || !user) {
                notice.textContent =
                    "Please log in again to verify your Worker Premium payment. Your payment reference is " +
                    workerPremiumReference;
                return;
            }

            const { data, error } =
                await supabaseClient.functions.invoke(
                    "verify-worker-premium-payment",
                    {
                        body: {
                            reference: workerPremiumReference
                        }
                    }
                );

            if (error || !data || data.success !== true) {
                console.error(
                    "Worker Premium payment verification failed:",
                    error || data
                );

                notice.textContent =
                    data?.message ||
                    data?.error ||
                    "We couldn't confirm your Worker Premium payment yet. Please contact support with reference: " +
                    workerPremiumReference;
                return;
            }

            notice.textContent =
                data.already_activated
                    ? "Your Worker Premium payment was already confirmed."
                    : "Payment verified! Your Worker Premium access has been activated.";

            // Remove the payment reference from the URL after success.
            window.history.replaceState(
                {},
                document.title,
                window.location.pathname
            );

            // Refresh the page after a short delay.
            window.setTimeout(function () {
                window.location.reload();
            }, 1800);

        } catch (error) {
            console.error(
                "Worker Premium payment return error:",
                error
            );

            notice.textContent =
                "We couldn't verify your payment right now. Please contact support with reference: " +
                workerPremiumReference;
        }
    })();
}

// ---------- Admin: report queue ----------

const adminReportsBody = document.getElementById("admin-reports-list");
if (adminReportsBody) {
    const reasonLabels = {
        payment: "Asks for money or a fee",
        fake: "Fake or misleading",
        inappropriate: "Inappropriate",
        spam: "Spam",
        other: "Something else"
    };

    async function loadAdminReports() {
        const message = document.getElementById("reports-message");
        adminReportsBody.replaceChildren();
        message.textContent = "Loading reports...";
        try {
            const { data: reports, error } = await supabaseClient
                .from("reports")
                .select("id, target_type, target_id, reason, details, status, created_at")
                .order("created_at", { ascending: false })
                .limit(100);
            if (error) {
                throw error;
            }
            const openCount = (reports || []).filter(function (r) { return r.status === "open"; }).length;
            const counter = document.getElementById("admin-report-count");
            if (counter) {
                counter.textContent = String(openCount);
            }
            if (!reports || !reports.length) {
                message.textContent = "No reports yet.";
                return;
            }
            message.textContent = "Showing " + reports.length + " report(s), " + openCount + " open.";

            const jobIds = reports.filter(function (r) { return r.target_type === "job"; }).map(function (r) { return r.target_id; });
            const userIds = reports.filter(function (r) { return r.target_type === "user"; }).map(function (r) { return r.target_id; });
            const jobs = jobIds.length ? (await supabaseClient.from("jobs").select("id, title").in("id", jobIds)).data || [] : [];
            const people = userIds.length ? (await supabaseClient.from("profiles").select("id, full_name").in("id", userIds)).data || [] : [];

            reports.forEach(function (report) {
                const row = document.createElement("tr");
                const cell = function (text) {
                    const td = document.createElement("td");
                    td.textContent = text;
                    row.appendChild(td);
                    return td;
                };
                cell(new Date(report.created_at).toLocaleDateString());
                cell(report.target_type === "job" ? "Job" : "Person");

                const targetCell = document.createElement("td");
                const link = document.createElement("a");
                if (report.target_type === "job") {
                    const job = jobs.find(function (j) { return String(j.id) === String(report.target_id); });
                    link.textContent = job ? job.title : "(job removed)";
                    link.href = "job.html?id=" + encodeURIComponent(report.target_id);
                } else {
                    const person = people.find(function (p) { return String(p.id) === String(report.target_id); });
                    link.textContent = person ? person.full_name || "Unnamed" : "(person removed)";
                    link.href = "worker.html?id=" + encodeURIComponent(report.target_id);
                }
                link.target = "_blank";
                link.rel = "noopener";
                targetCell.appendChild(link);
                row.appendChild(targetCell);

                cell(reasonLabels[report.reason] || report.reason);
                cell(report.details || "");
                cell(report.status);

                const actions = document.createElement("td");
                if (report.status === "open") {
                    [["resolved", "Resolve"], ["dismissed", "Dismiss"]].forEach(function (pair) {
                        const button = document.createElement("button");
                        button.type = "button";
                        button.className = "admin-button";
                        button.textContent = pair[1];
                        button.addEventListener("click", async function () {
                            button.disabled = true;
                            const { error: updateError } = await supabaseClient
                                .from("reports")
                                .update({ status: pair[0], resolved_at: new Date().toISOString() })
                                .eq("id", report.id);
                            if (updateError) {
                                console.error("Report update error:", updateError);
                                message.textContent = "Could not update that report.";
                                button.disabled = false;
                                return;
                            }
                            loadAdminReports();
                        });
                        actions.appendChild(button);
                    });
                }
                row.appendChild(actions);
                adminReportsBody.appendChild(row);
            });
        } catch (error) {
            console.error("Reports error:", error);
            message.textContent = "Could not load reports. Has sql/04-reports.sql been run?";
        }
    }

    const refreshReports = document.getElementById("refresh-reports");
    if (refreshReports) {
        refreshReports.addEventListener("click", loadAdminReports);
    }
    loadAdminReports();
}

// ================================
// LOGOUT
// ================================

const logoutButton = document.getElementById("logout-button");

if (logoutButton) {
    logoutButton.addEventListener("click", async function () {
        const confirmLogout = confirm(
            "Are you sure you want to log out?"
        );

        if (!confirmLogout) {
            return;
        }

        const { error } = await supabaseClient.auth.signOut();

        if (error) {
            alert("Logout failed: " + error.message);
            return;
        }

        window.location.href = "login.html";
    });
}

/* ========================================
   EMPLOYER DASHBOARD STATISTICS
======================================== */

const employerTotalJobs =
    document.getElementById("employer-total-jobs");

const employerActiveJobs =
    document.getElementById("employer-active-jobs");

const employerTotalApplications =
    document.getElementById("employer-total-applications");

if (
    employerTotalJobs &&
    employerActiveJobs &&
    employerTotalApplications
) {
    async function loadEmployerStatistics() {
        try {
            const {
                data: { user },
                error: authError
            } = await supabaseClient.auth.getUser();

            if (authError || !user) {
                window.location.href = "login.html";
                return;
            }

            // Get jobs posted by this employer
            const {
                data: jobs,
                error: jobsError
            } = await supabaseClient
                .from("jobs")
                .select("id, status")
                .eq("user_id", user.id);

            if (jobsError) {
                throw jobsError;
            }

            const employerJobs = jobs || [];

            const activeJobs = employerJobs.filter(
                job =>
                    String(job.status || "").toLowerCase() === "active"
            ).length;

            employerTotalJobs.textContent =
                employerJobs.length;

            employerActiveJobs.textContent =
                activeJobs;

            // Count applications for the employer's jobs
            const jobIds = employerJobs.map(job => job.id);

            if (jobIds.length === 0) {
                employerTotalApplications.textContent = "0";
                return;
            }

            const {
                count,
                error: applicationsError
            } = await supabaseClient
                .from("applications")
                .select("id", {
                    count: "exact",
                    head: true
                })
                .in("job_id", jobIds);

            if (applicationsError) {
                throw applicationsError;
            }

            employerTotalApplications.textContent =
                count ?? 0;

        } catch (error) {
            console.error(
                "Employer statistics error:",
                error
            );
        }
    }

    loadEmployerStatistics();
}

 // ========================================
 // NAIJAJOBS - LOAD AND SAVE PROFILE
 // ========================================

const profileForm = document.getElementById("profile-form");

if (profileForm) {

    const profileMessage =
        document.getElementById("profile-message");

    async function loadProfile() {

        if (profileMessage) {
            profileMessage.textContent = "Loading your profile...";
        }

        try {

            const {
                data: { user },
                error: authError
            } = await supabaseClient.auth.getUser();

            if (authError || !user) {
                window.location.href = "login.html";
                return;
            }

            const {
                data: profile,
                error
            } = await supabaseClient
                .from("profiles")
                .select(`
                    id,
                    full_name,
                    email,
                    account_type,
                    location,
                    skills,
                    bio
                `)
                .eq("id", user.id)
                .maybeSingle();

            if (error) {
                console.error("Load profile error:", error);
                profileMessage.textContent =
                    "Could not load your profile. Please try again.";
                return;
            }

            if (!profile) {
                profileMessage.textContent =
                    "Your profile record was not found. Please contact support.";
                return;
            }

            document.getElementById("full-name").value =
                profile.full_name || "";

            document.getElementById("profile-email").value =
                profile.email || user.email || "";

            document.getElementById("account-type").value =
                profile.account_type || "";

            document.getElementById("location").value =
                profile.location || "";

            document.getElementById("skills").value =
                Array.isArray(profile.skills)
                    ? profile.skills.join(", ")
                    : profile.skills || "";

            document.getElementById("bio").value =
                profile.bio || "";

            const displayName =
                document.getElementById("profile-display-name");

            const avatarLetter =
                document.getElementById("profile-avatar-letter");

            if (displayName) {
                displayName.textContent =
                    profile.full_name || "My Profile";
            }

            if (avatarLetter) {
                avatarLetter.textContent =
                    (profile.full_name || "N").charAt(0).toUpperCase();
            }

            profileMessage.textContent = "";

        } catch (error) {

            console.error("Unexpected load profile error:", error);

            if (profileMessage) {
                profileMessage.textContent =
                    "Something went wrong while loading your profile.";
            }
        }
    }


    profileForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        if (profileMessage) {
            profileMessage.textContent = "Saving your profile...";
        }

        try {

            const {
                data: { user },
                error: authError
            } = await supabaseClient.auth.getUser();

            if (authError || !user) {
                if (profileMessage) {
                    profileMessage.textContent =
                        "Please log in again to save your profile.";
                }

                return;
            }

            const fullName =
                document.getElementById("full-name").value.trim();

            const accountType =
                document.getElementById("account-type").value;

            const location =
                document.getElementById("location").value.trim();

            const skills =
                document.getElementById("skills").value.trim();

            const bio =
                document.getElementById("bio").value.trim();

            if (!fullName || !accountType) {
                profileMessage.textContent =
                    "Please enter your full name and select your account type.";
                return;
            }
                
const {
    data: savedProfile,
    error
} = await supabaseClient
    .from("profiles")
    .update({
        full_name: fullName,
        location: location || null,
        skills: skills || null,
        bio: bio || null
    })
    .eq("id", user.id)
    .select("id, full_name, location, skills, bio, account_type")
    .maybeSingle();

if (error) {
    console.error("Save profile error:", error);

    profileMessage.textContent =
        "Could not save your profile. Check your Supabase permissions.";
    return;
}

if (!savedProfile) {
    profileMessage.textContent =
        "Your profile was not updated. Check that your profile exists and you have permission to update it.";
    return;
}


            const displayName =
                document.getElementById("profile-display-name");

            const avatarLetter =
                document.getElementById("profile-avatar-letter");

            if (displayName) {
                displayName.textContent = fullName;
            }

            if (avatarLetter) {
                avatarLetter.textContent =
                    fullName.charAt(0).toUpperCase();
            }

            profileMessage.textContent =
                "Profile saved successfully!";

        } catch (error) {

            console.error("Unexpected save profile error:", error);

            if (profileMessage) {
                profileMessage.textContent =
                    "Something went wrong. Please try again.";
            }
        }

    });

    loadProfile();

/* ========================================
   PROFILE PICTURE UPLOAD
======================================== */

const profilePictureInput =
    document.getElementById("profile-picture-input");

const uploadProfilePictureButton =
    document.getElementById("upload-profile-picture");

const profilePicture =
    document.getElementById("profile-picture");

const profilePictureMessage =
    document.getElementById("profile-picture-message");

const profileAvatarLetter =
    document.getElementById("profile-avatar-letter");

async function loadProfilePicture() {
    if (!profilePicture) return;

    try {
        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser();

        if (authError || !user) return;

        const { data: profile, error } = await supabaseClient
            .from("profiles")
            .select("profile_picture_path")
            .eq("id", user.id)
            .maybeSingle();

        if (error) throw error;

        if (!profile?.profile_picture_path) return;

        const { data, error: urlError } = await supabaseClient
            .storage
            .from("profile-pictures")
            .createSignedUrl(profile.profile_picture_path, 3600);

        if (urlError) throw urlError;

        profilePicture.src = data.signedUrl;
        profilePicture.hidden = false;

        if (profileAvatarLetter) {
            profileAvatarLetter.hidden = true;
        }
    } catch (error) {
        console.error("Load profile picture error:", error);
    }
}

if (profilePictureInput && uploadProfilePictureButton) {
    uploadProfilePictureButton.addEventListener("click", async function () {
        const file = profilePictureInput.files[0];

        if (!file) {
            profilePictureMessage.textContent =
                "Please choose a picture first.";
            return;
        }

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        if (!allowedTypes.includes(file.type)) {
            profilePictureMessage.textContent =
                "Please choose a JPG, PNG, or WebP image.";
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            profilePictureMessage.textContent =
                "Your picture must be 2 MB or smaller.";
            return;
        }

        uploadProfilePictureButton.disabled = true;
        uploadProfilePictureButton.textContent = "Uploading...";
        profilePictureMessage.textContent = "";

        try {
            const {
                data: { user },
                error: authError
            } = await supabaseClient.auth.getUser();

            if (authError || !user) {
                throw new Error("Please log in before uploading a picture.");
            }

            const extension = {
                "image/jpeg": "jpg",
                "image/png": "png",
                "image/webp": "webp"
            }[file.type];

            const filePath =
                `${user.id}/${Date.now()}.${extension}`;

            const { error: uploadError } = await supabaseClient
                .storage
                .from("profile-pictures")
                .upload(filePath, file, {
                    contentType: file.type,
                    upsert: false
                });

            if (uploadError) throw uploadError;

            const { error: updateError } = await supabaseClient
                .from("profiles")
                .update({
                    profile_picture_path: filePath
                })
                .eq("id", user.id);

            if (updateError) {
                // Remove the newly uploaded file if saving its path fails.
                await supabaseClient
                    .storage
                    .from("profile-pictures")
                    .remove([filePath]);

                throw updateError;
            }

            const { data, error: urlError } = await supabaseClient
                .storage
                .from("profile-pictures")
                .createSignedUrl(filePath, 3600);

            if (urlError) throw urlError;

            profilePicture.src = data.signedUrl;
            profilePicture.hidden = false;

            if (profileAvatarLetter) {
                profileAvatarLetter.hidden = true;
            }

            profilePictureMessage.textContent =
                "Profile picture uploaded successfully!";
        } catch (error) {
            console.error("Upload profile picture error:", error);

            profilePictureMessage.textContent =
                error.message || "Could not upload your picture. Please try again.";
        } finally {
            uploadProfilePictureButton.disabled = false;
            uploadProfilePictureButton.textContent = "Upload picture";
        }
    });

    loadProfilePicture();
}

}
/* =========================================
NAIJAJOBS - LOAD MESSAGES INBOX
========================================= */

async function loadMessagesInbox() {
const container = document.getElementById("messages-container");

if (!container) return;

container.innerHTML = `
    <div class="messages-empty-state nj-messages-empty-state">
        <h3>Loading conversations...</h3>
        <p>Please wait while we load your inbox.</p>
    </div>
`;

try {
    const {
        data: { user },
        error: authError
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
        window.location.href = "login.html";
        return;
    }

    
const { data: conversations, error } = await supabaseClient
    .from("conversations")
    .select(`
        id,
        participant_one,
        participant_two,
        updated_at
    `)
    .or(
        `participant_one.eq.${user.id},participant_two.eq.${user.id}`
    );

if (error) throw error;

if (!conversations || conversations.length === 0) {
    container.innerHTML = `
        <div class="messages-empty-state nj-messages-empty-state">
            <div class="nj-messages-empty-icon">
                <span>💬</span>
            </div>
            <h3>No conversations yet</h3>
            <p>
                When you start messaging an employer or job seeker,
                your conversations will appear here.
            </p>
            <a href="browse.html"
               class="messages-browse-button nj-messages-browse-button">
                Explore Jobs <span>→</span>
            </a>
        </div>
    `;
    return;
}


    if (error) throw error;

    if (!conversations || conversations.length === 0) {
        container.innerHTML = `
            <div class="messages-empty-state nj-messages-empty-state">
                <div class="nj-messages-empty-icon">
                    <span>💬</span>
                </div>
                <h3>No conversations yet</h3>
                <p>
                    When you start messaging an employer or job seeker,
                    your conversations will appear here.
                </p>
                <a href="browse.html"
                   class="messages-browse-button nj-messages-browse-button">
                    Explore Jobs <span>→</span>
                </a>
            </div>
        `;
        return;
    }

    const otherUserIds = [
        ...new Set(
            conversations.map(conversation =>
                conversation.participant_one === user.id
                    ? conversation.participant_two
                    : conversation.participant_one
            )
        )
    ];

   
const profileMap = new Map();

for (const conversation of conversations) {
    const otherUserId =
        conversation.participant_one === user.id
            ? conversation.participant_two
            : conversation.participant_one;

    const { data: profileData, error: profileError } =
        await supabaseClient.rpc("get_chat_partner_profile", {
            p_conversation_id: conversation.id
        });

    if (profileError) {
        console.error(
            "Error loading inbox chat partner profile:",
            profileError
        );
        continue;
    }

    const profile = Array.isArray(profileData)
        ? profileData[0]
        : profileData;

    
if (profile) {
    let profilePictureUrl = null;

    if (profile.profile_picture_path) {
        const { data: pictureData, error: pictureError } =
            await supabaseClient
                .storage
                .from("profile-pictures")
                .createSignedUrl(
                    profile.profile_picture_path,
                    3600
                );

        if (pictureError) {
            console.error(
                "Error loading inbox profile picture:",
                pictureError
            );
        } else {
            profilePictureUrl = pictureData?.signedUrl || null;
        }
    }

    profileMap.set(otherUserId, {
        ...profile,
        account_type: null,
        profile_picture_url: profilePictureUrl
    });
}

}


    const conversationIds = conversations.map(item => item.id);

    
const { data: messages, error: messagesError } = await supabaseClient
    .from("messages")
    .select("conversation_id, content, sender_id, created_at, read_at")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false });


    if (messagesError) throw messagesError;

    const latestMessageMap = new Map();

    (messages || []).forEach(message => {
        if (!latestMessageMap.has(message.conversation_id)) {
            latestMessageMap.set(message.conversation_id, message);
        }
    });

    conversations.sort((a, b) => {
    const latestA = latestMessageMap.get(a.id);
    const latestB = latestMessageMap.get(b.id);

    const dateA = new Date(
        latestA?.created_at || a.updated_at
    ).getTime();

    const dateB = new Date(
        latestB?.created_at || b.updated_at
    ).getTime();

    return dateB - dateA;
});

    
const unreadCountMap = new Map();
let totalUnread = 0;

(messages || []).forEach(message => {
    if (
        message.sender_id !== user.id &&
        message.read_at === null
    ) {
        const currentCount =
            unreadCountMap.get(message.conversation_id) || 0;

        unreadCountMap.set(
            message.conversation_id,
            currentCount + 1
        );

        totalUnread++;
    }
});


    container.innerHTML = `
    ${
        totalUnread > 0
            ? `
                <div class="nj-unread-summary">
                    You have
                    <strong>${totalUnread}</strong>
                    unread message${totalUnread === 1 ? "" : "s"}.
                </div>
            `
            : ""
    }

    ${conversations.map(conversation => {

        const otherUserId =
            conversation.participant_one === user.id
                ? conversation.participant_two
                : conversation.participant_one;

        const profile = profileMap.get(otherUserId);
        const name = profile?.full_name || "NaijaJobs user";
        const initial = name.charAt(0).toUpperCase();
        const latestMessage = latestMessageMap.get(conversation.id);

        const preview = latestMessage
            ? `${latestMessage.sender_id === user.id ? "You: " : ""}${latestMessage.content}`
            : "Start your conversation";

        const date = latestMessage?.created_at || conversation.updated_at;
        const time = date
            ? new Date(date).toLocaleDateString()
            : "";

        return `
            <a
                href="message.html?conversation=${encodeURIComponent(conversation.id)}"
                class="nj-conversation-card"
            >
                
<div class="nj-conversation-avatar">
    ${
        profile?.profile_picture_url
            ? `<img
                    src="${escapeHTML(profile.profile_picture_url)}"
                    alt="${escapeHTML(name)}"
                    style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;"
               >`
            : escapeHTML(initial)
    }
</div>


                <div class="nj-conversation-info">
                    <h3>${escapeHTML(name)}</h3>
                    <p>${escapeHTML(preview)}</p>

${
    (unreadCountMap.get(conversation.id) || 0) > 0
        ? `
            <span class="nj-unread-badge">
                ${unreadCountMap.get(conversation.id)}
                unread
            </span>
        `
        : ""
}
                </div>

                <span class="nj-conversation-time">
                    ${escapeHTML(time)}
                </span>
            </a>
        `;
    }).join("")}
`;

} catch (error) {
    console.error("Error loading messages inbox:", error);

    container.innerHTML = `
        <div class="messages-empty-state nj-messages-empty-state">
            <h3>Couldn't load your inbox</h3>
            <p>Please refresh the page and try again.</p>
        </div>
    `;
}

}

loadMessagesInbox();

/* =========================================
   NAIJAJOBS - REAL-TIME INBOX
========================================= */

let naijaJobsInboxChannel = null;
let inboxRefreshTimeout = null;

async function initializeNaijaJobsRealtimeInbox() {
    const container =
        document.getElementById("messages-container");

    // Only run on messages.html
    if (!container) return;

    try {
        const {
            data: { user },
            error
        } = await supabaseClient.auth.getUser();

        if (error) throw error;

        if (!user) {
            window.location.href = "login.html";
            return;
        }

        // Load the inbox initially.
        await loadMessagesInbox();

        // Prevent duplicate subscriptions.
        if (naijaJobsInboxChannel) {
            await supabaseClient.removeChannel(
                naijaJobsInboxChannel
            );
        }

        function scheduleInboxRefresh() {
            // Combine closely spaced events into one refresh.
            clearTimeout(inboxRefreshTimeout);

            inboxRefreshTimeout = setTimeout(() => {
                loadMessagesInbox().catch(error => {
                    console.error(
                        "Real-time inbox refresh failed:",
                        error
                    );
                });
            }, 300);
        }

        
console.log(
    "Creating inbox channel for user:",
    user.id
);

naijaJobsInboxChannel = supabaseClient
    .channel("naijajobs-inbox-" + user.id)

    // Listen for new messages.
    .on(
        "postgres_changes",
        {
            event: "INSERT",
            schema: "public",
            table: "messages"
        },
        payload => {
            console.log(
                "Inbox received a message event:",
                payload
            );

            const message = payload.new || payload.old;

            if (
                message &&
                message.conversation_id
            ) {
                scheduleInboxRefresh();
            }
        }
    )

    // Listen for conversation updates.
    .on(
        "postgres_changes",
        {
            event: "UPDATE",
            schema: "public",
            table: "conversations"
        },
        payload => {
            const conversation = payload.new || payload.old;

            if (
                conversation &&
                (
                    conversation.participant_one === user.id ||
                    conversation.participant_two === user.id
                )
            ) {
                scheduleInboxRefresh();
            }
        }
    )

    .subscribe((status, error) => {
        console.log(
            "Inbox Realtime status:",
            status,
            error || ""
        );

        if (status === "SUBSCRIBED") {
            console.log(
                "Inbox subscription is connected."
            );
        } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
        ) {
            console.error(
                "Inbox Realtime problem:",
                status,
                error
            );
        }
    });


        // Clean up when leaving the inbox page.
        window.addEventListener(
            "pagehide",
            () => {
                clearTimeout(inboxRefreshTimeout);

                if (naijaJobsInboxChannel) {
                    supabaseClient.removeChannel(
                        naijaJobsInboxChannel
                    );

                    naijaJobsInboxChannel = null;
                }
            },
            { once: true }
        );

    } catch (error) {
        console.error(
            "Could not initialize real-time inbox:",
            error
        );
    }
}

initializeNaijaJobsRealtimeInbox();

/* =========================================
   NAIJAJOBS - REAL-TIME CHAT
========================================= */

async function initializeNaijaJobsChat() {
    const chatMessages =
        document.getElementById("chat-messages");

    const chatForm =
        document.getElementById("chat-form");

    // Only run on message.html
    if (!chatMessages || !chatForm) return;

    const chatInput =
        document.getElementById("chat-input");
        
/* Enter sends; Shift + Enter creates a new line */
if (chatInput) {
    chatInput.addEventListener("keydown", function (event) {
        if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.isComposing
        ) {
            event.preventDefault();

            if (chatForm) {
                chatForm.requestSubmit();
            }
        }
    });
}


    const sendButton =
        document.getElementById("chat-send");

    const chatName =
        document.getElementById("chat-name");

    const chatAvatar =
        document.getElementById("chat-avatar");

    const chatNotice =
        document.getElementById("chat-notice");

    const chatStatus =
        document.getElementById("chat-status");

    const params =
        new URLSearchParams(window.location.search);

    const conversationId =
        params.get("conversation");

    let currentUser = null;
    let sending = false;
    let realtimeChannel = null;

    function showNotice(message, isError = false) {
        chatNotice.textContent = message;
        chatNotice.classList.toggle(
            "nj-chat-error",
            isError
        );
    }

    function renderMessages(messages) {
        chatMessages.replaceChildren();

        if (!messages || messages.length === 0) {
            const empty = document.createElement("div");

            empty.className = "nj-chat-notice";
            empty.textContent =
                "No messages yet. Send the first message!";

            chatMessages.appendChild(empty);
            return;
        }

        messages.forEach(message => {
            const bubble =
                document.createElement("div");

            bubble.className =
                "nj-chat-bubble " +
                (message.sender_id === currentUser.id
                    ? "nj-chat-mine"
                    : "nj-chat-theirs");

            const text = document.createElement("p");
            text.textContent = message.content;

            const time = document.createElement("time");
            time.dateTime = message.created_at;
            time.textContent = new Date(
                message.created_at
            ).toLocaleString();

            bubble.append(text, time);
            chatMessages.appendChild(bubble);
        });

        chatMessages.scrollTop =
            chatMessages.scrollHeight;
    }

    async function loadChatMessages() {
        const { data, error } = await supabaseClient
            .from("messages")
            .select(
                "id, sender_id, content, created_at, read_at"
            )
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: true });

        if (error) throw error;

        renderMessages(data);

        // Mark incoming messages as read.
        const { error: readError } =
            await supabaseClient.rpc(
                "mark_conversation_messages_read",
                {
                    p_conversation_id: conversationId
                }
            );

        if (readError) {
            console.error(
                "Could not mark messages as read:",
                readError
            );
        }
    }

    try {
        if (!conversationId) {
            chatMessages.textContent =
                "No conversation selected. Return to your inbox and open a conversation.";

            chatForm.hidden = true;
            return;
        }

        // Check authentication.
        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser();

        if (authError) throw authError;

        if (!user) {
            window.location.href = "login.html";
            return;
        }

        currentUser = user;

        // Verify conversation access.
        const {
            data: conversation,
            error: conversationError
        } = await supabaseClient
            .from("conversations")
            .select(
                "id, participant_one, participant_two"
            )
            .eq("id", conversationId)
            .maybeSingle();

        if (conversationError) {
            throw conversationError;
        }

        if (!conversation) {
            chatMessages.textContent =
                "Conversation not found or access denied.";

            chatForm.hidden = true;
            return;
        }

        
        // Verify the logged-in user is a participant.
        if (
            conversation.participant_one !== user.id &&
            conversation.participant_two !== user.id
        ) {
            chatMessages.textContent =
                "You don't have permission to access this conversation.";

            chatForm.hidden = true;
            return;
        }

        // Identify the other person in the conversation.
        const otherUserId =
            conversation.participant_one === user.id
                ? conversation.participant_two
                : conversation.participant_one;



    

const { data: profileData, error: profileError } =
    await supabaseClient.rpc("get_chat_partner_profile", {
        p_conversation_id: conversation.id
    });

if (profileError) {
    console.error("Error loading chat partner profile:", profileError);
    throw profileError;
}

const profile = Array.isArray(profileData)
    ? profileData[0]
    : profileData;


if (profileError) throw profileError;

const name = profile?.full_name || "NaijaJobs user";
chatName.textContent = name;

// Show the person's initial by default.
const chatAvatarLetter =
    document.getElementById("chat-avatar-letter");

const chatProfilePicture =
    document.getElementById("chat-profile-picture");

if (chatAvatarLetter) {
    chatAvatarLetter.textContent =
        name.charAt(0).toUpperCase();
    chatAvatarLetter.hidden = false;
}

if (chatProfilePicture) {
    chatProfilePicture.hidden = true;
    chatProfilePicture.removeAttribute("src");
}

// Load the profile picture from the private Storage bucket.
if (profile?.profile_picture_path && chatProfilePicture) {
    const { data: pictureData, error: pictureError } =
        await supabaseClient
            .storage
            .from("profile-pictures")
            .createSignedUrl(
                profile.profile_picture_path,
                3600
            );

    if (pictureError) {
        console.error(
            "Could not load chat profile picture:",
            pictureError
        );
    } else if (pictureData?.signedUrl) {
        chatProfilePicture.onload = function () {
            chatProfilePicture.hidden = false;

            if (chatAvatarLetter) {
                chatAvatarLetter.hidden = true;
            }
        };

        chatProfilePicture.onerror = function () {
            chatProfilePicture.hidden = true;

            if (chatAvatarLetter) {
                chatAvatarLetter.hidden = false;
            }
        };

        chatProfilePicture.src = pictureData.signedUrl;
    }
}

await loadChatMessages();

        // Subscribe to new messages in THIS conversation.
        realtimeChannel = supabaseClient
            .channel(
                "nj-chat-" + conversationId
            )
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "messages",
                    filter:
                        "conversation_id=eq." +
                        conversationId
                },
                async (payload) => {
                    // Ignore events without a new message.
                    if (!payload.new) return;

                    try {
                        await loadChatMessages();
                    } catch (error) {
                        console.error(
                            "Could not load real-time message:",
                            error
                        );

                        showNotice(
                            "A new message arrived, but the chat could not refresh. Please reload the page.",
                            true
                        );
                    }
                }
            )
            .subscribe((status, error) => {
                if (status === "SUBSCRIBED") {
                    if (chatStatus) {
                        chatStatus.textContent =
                            "Connected · Live updates";
                    }

                    showNotice("");
                    console.log(
                        "NaijaJobs Realtime connected."
                    );
                } else if (
                    status === "CHANNEL_ERROR" ||
                    status === "TIMED_OUT"
                ) {
                    if (chatStatus) {
                        chatStatus.textContent =
                            "Live connection unavailable";
                    }

                    showNotice(
                        "Live updates are unavailable. Check your connection or reload the page.",
                        true
                    );

                    console.error(
                        "Realtime subscription issue:",
                        status,
                        error
                    );
                }
            });

        // Load existing messages when chat opens.
        await loadChatMessages();

        // Send messages.
        chatForm.addEventListener(
            "submit",
            async function(event) {
                event.preventDefault();

                if (sending) return;

                const content =
                    chatInput.value.trim();

                if (!content) {
                    showNotice(
                        "Please type a message first.",
                        true
                    );
                    return;
                }

                sending = true;
                sendButton.disabled = true;
                showNotice("");

                try {
                    const { error: insertError } =
                        await supabaseClient
                            .from("messages")
                            .insert({
                                conversation_id:
                                    conversationId,
                                sender_id:
                                    currentUser.id,
                                content: content
                            });

                    if (insertError) {
                        throw insertError;
                    }

                    chatInput.value = "";

                    // The Realtime event will refresh the chat.
                    // Also refresh locally so your own message
                    // appears immediately after a successful send.
                    await loadChatMessages();

                } catch (error) {
                    console.error(
                        "Failed to send message:",
                        error
                    );

                    showNotice(
                        error.message ||
                        "Message could not be sent. Please try again.",
                        true
                    );
                } finally {
                    sending = false;
                    sendButton.disabled = false;
                }
            }
        );

        // Remove the subscription when leaving the page.
        window.addEventListener(
            "pagehide",
            () => {
                if (realtimeChannel) {
                    supabaseClient.removeChannel(
                        realtimeChannel
                    );

                    realtimeChannel = null;
                }
            },
            { once: true }
        );

    } catch (error) {
        console.error(
            "Chat initialization failed:",
            error
        );

        chatMessages.textContent =
            "Couldn't load this conversation. Please refresh and try again.";

        showNotice(
            error.message ||
            "An unexpected error occurred.",
            true
        );
    }
    }

initializeNaijaJobsChat();

/* =========================================
   NAIJAJOBS - ADMIN DASHBOARD
========================================= */

async function checkAdminAccess() {
    const adminPage = document.getElementById("admin-dashboard");

    // Do nothing on pages other than the admin dashboard.
    if (!adminPage) return;

    const message = document.getElementById("admin-message");
    if (!message) {
    console.error(
        "Admin dashboard is missing the element with id='admin-message'."
    );
    return;
}
    const logoutButton = document.getElementById("admin-logout");

    try {
        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser();

        if (authError || !user) {
            window.location.replace("login.html");
            return;
        }

        // Verify this user is listed as an administrator.
        const { data: admin, error: adminError } = await supabaseClient
            .from("admin_users")
            .select("user_id")
            .eq("user_id", user.id)
            .maybeSingle();

        if (adminError) {
            console.error("Admin verification failed:", adminError);
            message.textContent =
                "Unable to verify admin access. Please try again.";
            return;
        }

        if (!admin) {
            alert("Access denied. Administrators only.");
            window.location.replace("index.html");
            return;
        }

        // Show dashboard after verification succeeds.
        adminPage.hidden = false;
        message.textContent = "Administrator access verified.";

        // Load user count.
        const { count: userCount, error: userError } =
            await supabaseClient
                .from("profiles")
                .select("id", {
                    count: "exact",
                    head: true
                });

        document.getElementById("admin-user-count").textContent =
            userError ? "Unavailable" : userCount;

        // Load job count.
        const { count: jobCount, error: jobError } =
            await supabaseClient
                .from("jobs")
                .select("id", {
                    count: "exact",
                    head: true
                });

        document.getElementById("admin-job-count").textContent =
            jobError ? "Unavailable" : jobCount;

        if (userError || jobError) {
            console.warn(
                "Some dashboard counts could not load.",
                { userError, jobError }
            );
        }

        // Log out the administrator.
        if (logoutButton) {
            logoutButton.addEventListener("click", async () => {
                logoutButton.disabled = true;

                const { error } = await supabaseClient.auth.signOut();

                if (error) {
                    console.error("Admin logout failed:", error);
                    message.textContent = "Logout failed. Please try again.";
                    logoutButton.disabled = false;
                    return;
                }

                window.location.replace("login.html");
            });
        }

    } catch (error) {
        console.error("Admin dashboard error:", error);
        message.textContent =
            "Something went wrong while loading the admin dashboard.";
    }
}

checkAdminAccess();


/* =========================================
   SHARED ADMIN LOGOUT
========================================= */

document.addEventListener("DOMContentLoaded", () => {
    const logoutButton = document.getElementById("admin-logout");

    if (!logoutButton || !window.supabaseClient) return;

    logoutButton.addEventListener("click", async () => {
        logoutButton.disabled = true;

        try {
            const { error } = await window.supabaseClient.auth.signOut();

            if (error) {
                console.error("Admin logout failed:", error);
                alert("Logout failed. Please try again.");
                logoutButton.disabled = false;
                return;
            }

            window.location.replace("login.html");
        } catch (error) {
            console.error("Unexpected logout error:", error);
            alert("An unexpected error occurred while logging out.");
            logoutButton.disabled = false;
        }
    });
});


/* =========================================
   NAIJAJOBS - ADMIN USER MANAGEMENT
========================================= */


async function loadAdminUsers() {
    const tableBody = document.getElementById("admin-users-list");

    if (!tableBody) return;

    const message = document.getElementById("users-message");

    tableBody.replaceChildren();
    message.textContent = "Loading users...";

    try {
        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser();

        if (authError || !user) {
            window.location.replace("login.html");
            return;
        }

        const { data, error } = await supabaseClient.rpc(
            "admin_list_profiles"
        );

        if (error) throw error;
        console.table(data);

        if (!data || data.length === 0) {
            message.textContent = "No registered profiles found.";
            return;
        }

        data.forEach(function (profile) {
            const row = document.createElement("tr");

            
const values = [
    profile.full_name || "Name not provided",
    profile.account_type || "Not specified",
    profile.location || "Not provided",
    profile.skills || "Not provided",
    profile.is_suspended ? "Suspended" : "Active",
    profile.account_type === "client"
        ? (profile.employer_status || "pending")
        : "Not applicable"
];


            values.forEach(function (value) {
                const cell = document.createElement("td");
                cell.style.padding = "12px";
                cell.style.borderBottom = "1px solid #eee";
                cell.textContent = value;
                row.appendChild(cell);
            });

            const actionCell = document.createElement("td");
            actionCell.style.padding = "12px";
            actionCell.style.borderBottom = "1px solid #eee";

            const actionButton = document.createElement("button");
            actionButton.type = "button";
            actionButton.className = "admin-button";
            actionButton.textContent = profile.is_suspended
                ? "Restore User"
                : "Suspend User";

            actionButton.addEventListener("click", async function () {
                const newSuspensionStatus = !profile.is_suspended;

                const confirmed = window.confirm(
                    newSuspensionStatus
                        ? "Are you sure you want to suspend this user?"
                        : "Are you sure you want to restore this user?"
                );

                if (!confirmed) return;

                actionButton.disabled = true;
                message.textContent = newSuspensionStatus
                    ? "Suspending user..."
                    : "Restoring user...";

                try {
                    const { error: updateError } =
                        await supabaseClient.rpc(
                            "admin_set_user_suspension",
                            {
                                p_user_id: profile.id,
                                p_is_suspended: newSuspensionStatus
                            }
                        );

                    if (updateError) throw updateError;

                    // Record the successful change in the activity log.
                    const { error: logError } =
                        await supabaseClient.rpc(
                            "admin_record_activity",
                            {
                                p_action: newSuspensionStatus
                                    ? "user_suspended"
                                    : "user_restored",
                                p_target_type: "user",
                                p_target_id: String(profile.id),
                                p_details: {
                                    full_name: profile.full_name ||
                                        "Name not provided"
                                }
                            }
                        );

                    if (logError) {
                        console.error(
                            "Activity log failed:",
                            logError
                        );
                    }

                    await loadAdminUsers();
                    await loadAdminActivity();

                } catch (error) {
                    console.error(
                        "Unable to change user status:",
                        error
                    );

                    message.textContent =
                        "Could not change user status: " +
                        error.message;

                    actionButton.disabled = false;
                }
            });

            actionCell.appendChild(actionButton);
            
if (profile.account_type === "client") {
    const approvalSelect = document.createElement("select");
    approvalSelect.className = "admin-button";
    approvalSelect.style.marginLeft = "8px";

    const statuses = [
        { value: "pending", label: "Pending" },
        { value: "approved", label: "Approved" },
        { value: "rejected", label: "Rejected" }
    ];

    statuses.forEach(function (status) {
        const option = document.createElement("option");
        option.value = status.value;
        option.textContent = status.label;
        approvalSelect.appendChild(option);
    });

    approvalSelect.value = profile.employer_status || "pending";

    const approvalButton = document.createElement("button");
    approvalButton.type = "button";
    approvalButton.className = "admin-button";
    approvalButton.style.marginLeft = "8px";
    approvalButton.textContent = "Save Approval";

    approvalButton.addEventListener("click", async function () {
        const newStatus = approvalSelect.value;

        if (newStatus === profile.employer_status) {
            message.textContent = "Employer status is already " + newStatus + ".";
            return;
        }

        const confirmed = window.confirm(
            "Change this employer's status to " + newStatus + "?"
        );

        if (!confirmed) return;

        approvalButton.disabled = true;
        approvalSelect.disabled = true;
        message.textContent = "Updating employer approval...";

        try {
            const { error: approvalError } =
                await supabaseClient.rpc("admin_set_employer_status", {
                    p_user_id: profile.id,
                    p_status: newStatus
                });

            if (approvalError) throw approvalError;

            const { error: logError } =
                await supabaseClient.rpc("admin_record_activity", {
                    p_action: "employer_status_" + newStatus,
                    p_target_type: "user",
                    p_target_id: String(profile.id),
                    p_details: {
                        full_name: profile.full_name || "Name not provided",
                        employer_status: newStatus
                    }
                });

            if (logError) {
                console.error("Employer approval activity log failed:", logError);
            }

            await loadAdminUsers();
            await loadAdminActivity();

        } catch (error) {
            console.error("Unable to update employer status:", error);
            message.textContent =
                "Could not update employer approval: " + error.message;
            approvalButton.disabled = false;
            approvalSelect.disabled = false;
        }
    });

    actionCell.appendChild(approvalSelect);
    actionCell.appendChild(approvalButton);
}

            row.appendChild(actionCell);
            tableBody.appendChild(row);
        });
        

        message.textContent =
            "Showing " + data.length + " registered profiles.";

    } catch (error) {
        console.error("Unable to load admin users:", error);
        message.textContent =
            "Could not load users. Check the browser console.";
    }
}

const refreshAdminUsersButton =
    document.getElementById("refresh-users");

if (refreshAdminUsersButton) {
    refreshAdminUsersButton.addEventListener(
        "click",
        loadAdminUsers
    );
}

loadAdminUsers();
// ========================================
// NAIJAJOBS - ADMIN JOB MANAGEMENT
// ========================================

async function loadAdminJobs() {
const tableBody = document.getElementById("admin-jobs-list");

if (!tableBody) return;

const message = document.getElementById("jobs-message");

tableBody.replaceChildren();
message.textContent = "Loading job listings...";

try {
    const {
        data: { user },
        error: authError
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
        window.location.replace("login.html");
        return;
    }

    const { data: jobs, error } = await supabaseClient
        .from("jobs")
        .select(
            "id, title, description, category, budget, location, job_type, deadline, status, created_at"
        )
        .order("created_at", { ascending: false });

    if (error) throw error;

    if (!jobs || jobs.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 4;
        cell.style.padding = "12px";
        cell.textContent = "No job listings found.";

        row.appendChild(cell);
        tableBody.appendChild(row);

        message.textContent = "No jobs to display.";
        return;
    }

    jobs.forEach(function (job) {
        const row = document.createElement("tr");

        [
            job.title || "Untitled job",
            job.category || "Not specified",
            job.location || "Not specified"
        ].forEach(function (value) {
            const cell = document.createElement("td");
            cell.style.padding = "12px";
            cell.style.borderBottom = "1px solid #eee";
            cell.textContent = value;
            row.appendChild(cell);
        });

        const actionCell = document.createElement("td");
        actionCell.style.padding = "12px";
        actionCell.style.borderBottom = "1px solid #eee";

        // VIEW DETAILS BUTTON
        const viewButton = document.createElement("button");
        viewButton.type = "button";
        viewButton.className = "admin-button";
        viewButton.textContent = "View Details";

        viewButton.addEventListener("click", function () {
            const existingDetails = document.getElementById(
                "job-details-" + job.id
            );

            if (existingDetails) {
                existingDetails.remove();
                viewButton.textContent = "View Details";
                return;
            }

            const detailsRow = document.createElement("tr");
            detailsRow.id = "job-details-" + job.id;

            const detailsCell = document.createElement("td");
            detailsCell.colSpan = 4;
            detailsCell.style.padding = "16px";
            detailsCell.style.background = "#f7f8fc";

            const heading = document.createElement("h3");
            heading.textContent = job.title || "Untitled job";
            detailsCell.appendChild(heading);

            const details = [
                ["Description", job.description],
                ["Category", job.category],
                ["Budget", job.budget],
                ["Location", job.location],
                ["Job Type", job.job_type],
                ["Deadline", job.deadline],
                ["Status", job.status],
                ["Date Posted", job.created_at]
            ];

            details.forEach(function (item) {
                const paragraph = document.createElement("p");
                const label = document.createElement("strong");

                label.textContent = item[0] + ": ";
                paragraph.appendChild(label);

                let value = item[1];

                if (
                    item[0] === "Deadline" ||
                    item[0] === "Date Posted"
                ) {
                    value = value
                        ? new Date(value).toLocaleString()
                        : "Not specified";
                } else if (
                    item[0] === "Budget" &&
                    value !== null &&
                    value !== undefined &&
                    value !== ""
                ) {
                    value = "₦" + Number(value).toLocaleString();
                } else {
                    value = value || "Not specified";
                }

                paragraph.appendChild(
                    document.createTextNode(String(value))
                );

                detailsCell.appendChild(paragraph);
            });

            detailsRow.appendChild(detailsCell);
            row.insertAdjacentElement("afterend", detailsRow);
            viewButton.textContent = "Hide Details";
        });

        actionCell.appendChild(viewButton);

        // CHANGE STATUS DROPDOWN
        const statusSelect = document.createElement("select");
        statusSelect.style.display = "block";
        statusSelect.style.marginTop = "8px";
        statusSelect.style.padding = "8px";
        statusSelect.style.maxWidth = "180px";

        const statuses = [
            { value: "open", label: "Open" },
            { value: "in_progress", label: "In Progress" },
            { value: "completed", label: "Completed" },
            { value: "closed", label: "Closed" },
            { value: "cancelled", label: "Cancelled" }
        ];

        statuses.forEach(function (status) {
            const option = document.createElement("option");
            option.value = status.value;
            option.textContent = status.label;
            statusSelect.appendChild(option);
        });

        const currentStatus = statuses.some(
            status => status.value === job.status
        ) ? job.status : "open";

        statusSelect.value = currentStatus;

        const saveStatusButton = document.createElement("button");
        saveStatusButton.type = "button";
        saveStatusButton.className = "admin-button";
        saveStatusButton.textContent = "Save Status";
        saveStatusButton.style.marginTop = "8px";

        saveStatusButton.addEventListener("click", async function () {
            const newStatus = statusSelect.value;

            if (newStatus === job.status) {
                message.textContent = "The job already has that status.";
                return;
            }

            saveStatusButton.disabled = true;
            message.textContent = "Updating job status...";

            try {
                const { error } = await supabaseClient.rpc(
                    "admin_update_job_status",
                    {
                        p_job_id: job.id,
                        p_status: newStatus
                    }
                );

                if (error) throw error;
await supabaseClient.rpc("admin_record_activity", {
p_action: "job_status_updated",
p_target_type: "job",
p_target_id: String(job.id),
p_details: {
title: job.title,
previous_status: job.status,
new_status: newStatus
}
});

                message.textContent = "Job status updated successfully.";
                await loadAdminJobs();

            } catch (error) {
                console.error("Status update failed:", error);
                message.textContent =
                    "Could not update status: " + error.message;
                saveStatusButton.disabled = false;
            }
        });

        actionCell.appendChild(statusSelect);
        actionCell.appendChild(saveStatusButton);

        // DELETE JOB BUTTON
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "admin-button";
        deleteButton.textContent = "Delete Job";
        deleteButton.style.display = "block";
        deleteButton.style.marginTop = "8px";

        deleteButton.addEventListener("click", async function () {
            const confirmed = window.confirm(
                "Are you sure you want to permanently delete this job?\n\n" +
                (job.title || "Untitled job") +
                "\n\nThis action cannot be undone."
            );

            if (!confirmed) return;

            deleteButton.disabled = true;
            message.textContent = "Deleting job...";

            try {
                const { error } = await supabaseClient.rpc(
                    "admin_delete_job",
                    {
                        p_job_id: job.id
                    }
                );

                if (error) throw error;
await supabaseClient.rpc("admin_record_activity", {
p_action: "job_deleted",
p_target_type: "job",
p_target_id: String(job.id),
p_details: {
title: job.title,
previous_status: job.status
}
});

                message.textContent = "Job deleted successfully.";
                await loadAdminJobs();

            } catch (error) {
                console.error("Job deletion failed:", error);
                message.textContent =
                    "Could not delete job: " + error.message;
                deleteButton.disabled = false;
            }
        });

        actionCell.appendChild(deleteButton);
        row.appendChild(actionCell);
        tableBody.appendChild(row);
    });

    message.textContent =
        "Showing " + jobs.length + " job listing(s).";

} catch (error) {
    console.error("Unable to load admin jobs:", error);
    message.textContent =
        "Could not load jobs. Check the browser console for details.";
}

}


// Refresh job listings
const refreshAdminJobsButton =
document.getElementById("refresh-jobs");

if (refreshAdminJobsButton) {
refreshAdminJobsButton.addEventListener(
"click",
loadAdminJobs
);
}

// Load jobs when the admin dashboard opens
loadAdminJobs();
// ========================================
// NAIJAJOBS - ADMIN ACTIVITY LOG
// ========================================

async function loadAdminActivity() {
const tableBody = document.getElementById("admin-activity-list");

if (!tableBody) return;

const message = document.getElementById("activity-message");

tableBody.replaceChildren();
message.textContent = "Loading activity...";

try {
    const {
        data: { user },
        error: authError
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
        window.location.replace("login.html");
        return;
    }

    const { data: logs, error } = await supabaseClient
        .from("admin_activity_logs")
        .select("id, admin_user_id, action, target_type, target_id, details, created_at")
        .order("created_at", { ascending: false })
        .limit(100);

    if (error) throw error;

    if (!logs || logs.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 4;
        cell.style.padding = "12px";
        cell.textContent = "No activity recorded yet.";

        row.appendChild(cell);
        tableBody.appendChild(row);

        message.textContent = "No activity recorded yet.";
        return;
    }

    logs.forEach(function (log) {
        const row = document.createElement("tr");

        const dateCell = document.createElement("td");
        dateCell.style.padding = "12px";
        dateCell.style.borderBottom = "1px solid #eee";
        dateCell.textContent = new Date(
            log.created_at
        ).toLocaleString();
        row.appendChild(dateCell);

        const actionCell = document.createElement("td");
        actionCell.style.padding = "12px";
        actionCell.style.borderBottom = "1px solid #eee";
        actionCell.textContent = log.action;
        row.appendChild(actionCell);

        const targetCell = document.createElement("td");
        targetCell.style.padding = "12px";
        targetCell.style.borderBottom = "1px solid #eee";
        targetCell.textContent =
            log.target_type +
            (log.target_id ? " (" + log.target_id + ")" : "");
        row.appendChild(targetCell);

        const detailsCell = document.createElement("td");
        detailsCell.style.padding = "12px";
        detailsCell.style.borderBottom = "1px solid #eee";

        const details = document.createElement("pre");
        details.style.whiteSpace = "pre-wrap";
        details.style.margin = "0";
        details.textContent = JSON.stringify(
            log.details || {},
            null,
            2
        );

        detailsCell.appendChild(details);
        row.appendChild(detailsCell);

        tableBody.appendChild(row);
    });

    message.textContent =
        "Showing " + logs.length + " recent activity record(s).";

} catch (error) {
    console.error("Unable to load admin activity:", error);

    message.textContent =
        "Could not load activity. Check the browser console.";
}

}

const refreshActivityButton =
document.getElementById("refresh-activity");

if (refreshActivityButton) {
refreshActivityButton.addEventListener(
"click",
loadAdminActivity
);
}

loadAdminActivity();


/* =================================
   NAIJAJOBS MOBILE SIDEBAR TOGGLE
   ================================= */

(() => {
    const sidebar = document.getElementById("nj-sidebar");
    const toggle = document.getElementById("nj-menu-toggle");
    const overlay = document.getElementById("nj-sidebar-overlay");

    if (!sidebar || !toggle || !overlay) {
        return;
    }

    function openSidebar() {
        sidebar.classList.add("nj-sidebar-open");
        overlay.classList.add("nj-overlay-visible");
        document.body.classList.add("nj-sidebar-active");

        toggle.setAttribute("aria-expanded", "true");
        toggle.setAttribute("aria-label", "Close navigation menu");
        toggle.textContent = "×";
    }

    function closeSidebar() {
        sidebar.classList.remove("nj-sidebar-open");
        overlay.classList.remove("nj-overlay-visible");
        document.body.classList.remove("nj-sidebar-active");

        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open navigation menu");
        toggle.textContent = "☰";
    }

    toggle.addEventListener("click", () => {
        if (sidebar.classList.contains("nj-sidebar-open")) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    overlay.addEventListener("click", closeSidebar);

    sidebar.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", closeSidebar);
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeSidebar();
        }
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 768) {
            closeSidebar();
        }
    });
})();

/* =========================================
   NAIJAJOBS - SIDEBAR UNREAD MESSAGE BADGE
========================================= */

(function initializeSidebarUnreadBadge() {
    const badge = document.getElementById("messages-unread-badge");

    // Only run on pages that have the shared sidebar badge.
    if (!badge || typeof supabaseClient === "undefined") return;

    let unreadChannel = null;
    let refreshTimer = null;

    async function updateUnreadBadge() {
        try {
            const {
                data: { user },
                error: authError
            } = await supabaseClient.auth.getUser();

            if (authError) throw authError;

            if (!user) {
                badge.hidden = true;
                return;
            }

            const { count, error } = await supabaseClient
                .from("messages")
                .select("id", { count: "exact", head: true })
                .is("read_at", null)
                .neq("sender_id", user.id);

            if (error) throw error;

            const unreadCount = count || 0;

            badge.textContent =
                unreadCount > 99 ? "99+" : String(unreadCount);

            badge.hidden = unreadCount === 0;
            badge.setAttribute(
                "aria-label",
                `${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`
            );
        } catch (error) {
            console.error("Could not update unread message badge:", error);
        }
    }

    function scheduleBadgeRefresh() {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(updateUnreadBadge, 300);
    }

    async function startUnreadUpdates() {
        await updateUnreadBadge();

        const {
            data: { user },
            error
        } = await supabaseClient.auth.getUser();

        if (error || !user) return;

        unreadChannel = supabaseClient
            .channel("nj-sidebar-unread-" + user.id)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "messages"
                },
                scheduleBadgeRefresh
            )
            .subscribe();
    }

    startUnreadUpdates();

    window.addEventListener("pagehide", () => {
        clearTimeout(refreshTimer);

        if (unreadChannel) {
            supabaseClient.removeChannel(unreadChannel);
            unreadChannel = null;
        }
    }, { once: true });
})();

/* =========================================
   NAIJAJOBS - WORKER PREMIUM DASHBOARD
   Separate initializer; preserves existing code
========================================= */

(async function initializeWorkerPremiumDashboard() {
    const premiumSection = document.getElementById(
        "worker-premium-section"
    );

    // Run only on pages containing the Premium section.
    if (!premiumSection || typeof supabaseClient === "undefined") {
        return;
    }

    const premiumNote = premiumSection.querySelector(
        ".worker-premium-note"
    );

    const planButtons = premiumSection.querySelectorAll(
        "[data-premium-plan]"
    );

    try {
        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser();

        if (authError || !user) {
            premiumSection.hidden = true;
            return;
        }

        const {
            data: profile,
            error: profileError
        } = await supabaseClient
            .from("profiles")
            .select("account_type, is_suspended")
            .eq("id", user.id)
            .maybeSingle();

        if (profileError || !profile) {
            console.error(
                "Premium profile check failed:",
                profileError
            );
            premiumSection.hidden = true;
            return;
        }

        // Only active workers and job seekers can purchase Premium.
        if (
            profile.is_suspended ||
            !["worker", "job_seeker"].includes(profile.account_type)
        ) {
            premiumSection.hidden = true;
            return;
        }

        premiumSection.hidden = false;

        // Check whether the user already has an active Premium subscription.
        const {
            data: subscription,
            error: subscriptionError
        } = await supabaseClient
            .from("worker_premium_subscriptions")
            .select("plan_type, status, expires_at")
            .eq("user_id", user.id)
            .maybeSingle();

        if (subscriptionError) {
            console.error(
                "Premium subscription check failed:",
                subscriptionError
            );

            if (premiumNote) {
                premiumNote.textContent =
                    "We couldn't verify your Premium status. Please refresh and try again.";
            }

            planButtons.forEach(button => {
                button.disabled = true;
            });

            return;
        }

        
const subscriptionIsActive =
    subscription &&
    subscription.status === "active" &&
    (
        subscription.plan_type === "lifetime"
            ? subscription.expires_at === null
            : ["monthly", "yearly"].includes(subscription.plan_type) &&
              subscription.expires_at !== null &&
              new Date(subscription.expires_at).getTime() > Date.now()
    );

            // Update the separate Worker Plan badge on the dashboard.
const workerAccountPlan = document.getElementById(
    "worker-account-plan"
);

const workerAccountPlanBadge = document.getElementById(
    "worker-account-plan-badge"
);

if (workerAccountPlan && workerAccountPlanBadge) {
    if (subscriptionIsActive) {
        const workerPlanNames = {
            monthly: "Worker Premium Monthly",
            yearly: "Worker Premium Yearly",
            lifetime: "Worker Premium Lifetime"
        };

        workerAccountPlanBadge.textContent =
            workerPlanNames[subscription.plan_type] ||
            "Worker Premium";

        workerAccountPlan.hidden = false;
    } else {
        workerAccountPlan.hidden = true;
    }
}

        if (subscriptionIsActive) {
            if (premiumNote) {
                premiumNote.textContent =
                    subscription.plan_type === "lifetime"
                        ? "Your Lifetime Premium access is active."
                        : "Your Premium access is active until " +
                          new Date(subscription.expires_at).toLocaleDateString("en-NG") +
                          ".";
            }

            // Lifetime users should not be offered another purchase.
            if (subscription.plan_type === "lifetime") {
                planButtons.forEach(button => {
                    button.disabled = true;
                    button.textContent = "Lifetime Premium Active";
                });
                return;
            }

            if (premiumNote) {
                premiumNote.textContent +=
                    " You can choose a plan below to renew or extend your access.";
            }
        }

        planButtons.forEach(button => {
            button.addEventListener("click", async function () {
                const planType = button.dataset.premiumPlan;

                if (!["monthly", "yearly", "lifetime"].includes(planType)) {
                    return;
                }

                const originalText = button.textContent;

                planButtons.forEach(item => {
                    item.disabled = true;
                });

                button.textContent = "Preparing checkout...";

                if (premiumNote) {
                    premiumNote.textContent =
                        "Connecting securely to Paystack...";
                }

                try {
                    const {
                        data: { session },
                        error: sessionError
                    } = await supabaseClient.auth.getSession();

                    if (sessionError || !session?.access_token) {
                        throw new Error(
                            "Your session has expired. Please log in again."
                        );
                    }

                    const {
                        data,
                        error
                    } = await supabaseClient.functions.invoke(
                        "initialize-worker-premium-payment",
                        {
                            body: {
                                plan_type: planType
                            },
                            headers: {
                                Authorization:
                                    "Bearer " + session.access_token
                            }
                        }
                    );

                    if (error) {
                        throw error;
                    }

                    if (!data?.success || !data?.authorization_url) {
                        throw new Error(
                            data?.error ||
                            "Checkout could not be started. Please try again."
                        );
                    }

                    // Redirect only to the checkout URL returned by our Edge Function.
                    const checkoutUrl = new URL(data.authorization_url);

                    if (
                        checkoutUrl.protocol !== "https:" ||
                        checkoutUrl.hostname !== "checkout.paystack.com"
                    ) {
                        throw new Error(
                            "The checkout URL could not be verified."
                        );
                    }

                    window.location.assign(checkoutUrl.href);

                } catch (error) {
                    console.error(
                        "Worker Premium checkout initialization failed:",
                        error
                    );

                    if (premiumNote) {
                        premiumNote.textContent =
                            error.message ||
                            "Could not start checkout. Please try again.";
                    }

                    planButtons.forEach(item => {
                        item.disabled = false;
                    });

                    button.textContent = originalText;
                }
            });
        });

    } catch (error) {
        console.error(
            "Worker Premium dashboard initialization failed:",
            error
        );

        premiumSection.hidden = true;
    }
})();

/* =========================================
   NAIJAJOBS - WORKER PREMIUM PROFILE BADGE
========================================= */

(async function initializeWorkerPremiumProfileBadge() {
    const premiumBadge = document.getElementById(
        "worker-premium-badge"
    );

    // Run only on pages containing the Premium badge.
    if (!premiumBadge || typeof supabaseClient === "undefined") {
        return;
    }

    // Keep the badge hidden unless active access is confirmed.
    premiumBadge.hidden = true;

    try {
        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser();

        if (authError || !user) {
            return;
        }

        const {
            data: profile,
            error: profileError
        } = await supabaseClient
            .from("profiles")
            .select("account_type, is_suspended")
            .eq("id", user.id)
            .maybeSingle();

        if (
            profileError ||
            !profile ||
            profile.is_suspended ||
            !["worker", "job_seeker"].includes(profile.account_type)
        ) {
            return;
        }

        const {
            data: subscription,
            error: subscriptionError
        } = await supabaseClient
            .from("worker_premium_subscriptions")
            .select("plan_type, status, expires_at")
            .eq("user_id", user.id)
            .maybeSingle();

        if (subscriptionError || !subscription) {
            return;
        }

        const hasActivePremium =
            subscription.status === "active" &&
            (
                subscription.plan_type === "lifetime"
                    ? subscription.expires_at === null
                    : subscription.expires_at !== null &&
                      new Date(subscription.expires_at).getTime() > Date.now()
            );

        if (hasActivePremium) {
            premiumBadge.hidden = false;
        }

    } catch (error) {
        console.error(
            "Premium profile badge check failed:",
            error
        );

        premiumBadge.hidden = true;
    }
})();


/* =========================================
   NAIJAJOBS - CLIENT SUBSCRIPTION DASHBOARD
   Subscription status, plan badge and checkout
========================================= */

(async function initializeClientSubscriptionDashboard() {
    const section = document.getElementById("client-plans-section");

    if (!section || typeof supabaseClient === "undefined") {
        return;
    }

    const statusMessage = document.getElementById("client-plan-status");
    const message = document.getElementById("client-plan-message");
    const badgeContainer = document.getElementById("client-account-plan");
    const badge = document.getElementById("client-account-plan-badge");
    const buttons = section.querySelectorAll("[data-client-plan]");

    section.hidden = true;

    function showMessage(text, isError = false) {
        if (!message) return;

        message.textContent = text;
        message.style.color = isError ? "#b42318" : "#26734b";
    }

    function setButtonsDisabled(disabled) {
        buttons.forEach(button => {
            button.disabled = disabled;
        });
    }

    function formatDate(dateValue) {
        if (!dateValue) return "Not available";

        const date = new Date(dateValue);

        if (Number.isNaN(date.getTime())) {
            return "Not available";
        }

        return date.toLocaleDateString(undefined, {
            day: "numeric",
            month: "long",
            year: "numeric"
        });
    }

    
function displayPlan(plan, subscription = null) {
    if (
        profile.account_type !== "client" ||
        profile.is_suspended
    ) {
        if (badgeContainer) {
            badgeContainer.hidden = true;
        }

        return;
    }

    const planName =
        plan === "business" ? "Business" :
        plan === "starter" ? "Starter" :
        "Free";

    if (badgeContainer && badge) {
        badge.textContent = planName;
        badgeContainer.hidden = false;
        badge.dataset.plan = planName.toLowerCase();
    }

    section.hidden = false;

    if (statusMessage) {
        statusMessage.textContent = "Loading your subscription...";
    }
}

    async function loadSubscription(userId) {
        const { data, error } = await supabaseClient
            .from("client_subscriptions")
            .select("plan_type, status, started_at, expires_at, monthly_post_limit, featured_credits_remaining")
            .eq("user_id", userId)
            .eq("status", "active")
            .gt("expires_at", new Date().toISOString())
            .order("expires_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error("Could not load client subscription:", error);

            if (statusMessage) {
                statusMessage.textContent =
                    "We couldn't load your subscription details. Please refresh or contact support.";
            }

            showMessage(
                "Subscription details could not be loaded. Your payment has not been changed.",
                true
            );

            return null;
        }

        if (
            data &&
            ["starter", "business"].includes(data.plan_type)
        ) {
            return data;
        }

        return null;
    }

    try {
        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser();

        if (authError || !user) {
            return;
        }

        const {
            data: profile,
            error: profileError
        } = await supabaseClient
            .from("profiles")
            .select("account_type, is_suspended")
            .eq("id", user.id)
            .maybeSingle();

        if (profileError || !profile) {
            console.error("Client plan profile check failed:", profileError);
            return;
        }

        if (
            profile.account_type !== "client" ||
            profile.is_suspended
        ) {
            return;
        }

        section.hidden = false;

        if (badgeContainer) {
            badgeContainer.hidden = true;
        }

        if (statusMessage) {
            statusMessage.textContent = "Loading your subscription...";
        }

        // Verify Paystack callback first, if present.
        const params = new URLSearchParams(window.location.search);
        const verifyRequested =
            params.get("client_subscription") === "verify";
        const reference = params.get("reference");

        if (verifyRequested && reference) {
            setButtonsDisabled(true);

            if (statusMessage) {
                statusMessage.textContent =
                    "Verifying your payment securely. Please wait...";
            }

            try {
                const { data, error } =
                    await supabaseClient.functions.invoke(
                        "verify-client-subscription-payment",
                        {
                            body: { reference }
                        }
                    );

                if (error || !data?.success) {
                    console.error("Subscription verification response:", {
                        error,
                        data
                    });

                    showMessage(
                        data?.error ||
                        "We couldn't confirm your payment yet. Please contact support before trying to pay again.",
                        true
                    );
                } else {
                    showMessage(
                        data.already_verified
                            ? "Your payment was already verified successfully."
                            : "Your subscription payment was verified successfully."
                    );
                }
            } catch (verificationError) {
                console.error(
                    "Subscription verification failed:",
                    verificationError
                );

                showMessage(
                    "We couldn't verify the payment right now. Please contact support before trying to pay again.",
                    true
                );
            } finally {
                // Remove callback parameters after the verification attempt.
                params.delete("client_subscription");
                params.delete("reference");
                params.delete("trxref");

                const cleanUrl =
                    window.location.pathname +
                    (params.toString() ? `?${params.toString()}` : "") +
                    window.location.hash;

                window.history.replaceState({}, "", cleanUrl);
            }
        }

        // Always load the current database subscription.
        const subscription = await loadSubscription(user.id);

        if (subscription) {
            displayPlan(subscription.plan_type, subscription);
        } else {
            displayPlan("free");
        }

        // Register checkout handlers after loading the current plan.
        buttons.forEach(button => {
            button.addEventListener("click", async function () {
                const selectedPlan = button.dataset.clientPlan;

                if (selectedPlan === "free") {
                    showMessage(
                        "The Free plan allows 2 job posts per calendar month. No payment is required."
                    );
                    return;
                }

                if (
                    selectedPlan !== "starter" &&
                    selectedPlan !== "business"
                ) {
                    showMessage("Please choose a valid plan.", true);
                    return;
                }

                // Do not start another checkout if a paid plan is active.
                const currentSubscription = await loadSubscription(user.id);

                if (currentSubscription) {
                    displayPlan(
                        currentSubscription.plan_type,
                        currentSubscription
                    );

                    showMessage(
                        "You already have an active paid subscription. You cannot purchase another plan until it expires.",
                        true
                    );
                    return;
                }

                setButtonsDisabled(true);
                showMessage("Connecting securely to Paystack...");

                try {
                    const { data, error } =
                        await supabaseClient.functions.invoke(
                            "initialize-client-subscription-payment",
                            {
                                body: { plan: selectedPlan }
                            }
                        );

                    if (
                        error ||
                        !data?.authorization_url ||
                        !data?.reference
                    ) {
                        console.error("Checkout initialization response:", {
                            error,
                            data
                        });

                        showMessage(
                            data?.error ||
                            "We couldn't start checkout. Please try again later.",
                            true
                        );

                        setButtonsDisabled(false);
                        return;
                    }

                    const checkoutUrl = new URL(data.authorization_url);

                    if (
                        checkoutUrl.protocol !== "https:" ||
                        checkoutUrl.hostname !== "checkout.paystack.com"
                    ) {
                        showMessage(
                            "The checkout address could not be validated. Please contact support.",
                            true
                        );

                        setButtonsDisabled(false);
                        return;
                    }

                    window.location.assign(checkoutUrl.href);
                } catch (checkoutError) {
                    console.error("Client checkout error:", checkoutError);

                    showMessage(
                        "Something went wrong while starting checkout. Please try again.",
                        true
                    );

                    setButtonsDisabled(false);
                }
            });
        });
    } catch (error) {
        console.error(
            "Client subscription dashboard initialization failed:",
            error
        );

        section.hidden = true;
    }
})();
