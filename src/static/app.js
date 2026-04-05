document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const loginForm = document.getElementById("login-form");
  const createActivityForm = document.getElementById("create-activity-form");
  const logoutBtn = document.getElementById("logout-btn");
  const sessionLabel = document.getElementById("session-label");
  const loginPanel = document.getElementById("login-panel");
  const studentDashboard = document.getElementById("student-dashboard");
  const staffDashboard = document.getElementById("staff-dashboard");
  const adminDashboard = document.getElementById("admin-dashboard");
  const messageDiv = document.getElementById("message");

  let authToken = localStorage.getItem("authToken") || "";
  let currentUser = null;

  function showMessage(type, text) {
    messageDiv.textContent = text;
    messageDiv.className = type;
    messageDiv.classList.remove("hidden");

    setTimeout(() => {
      messageDiv.classList.add("hidden");
    }, 5000);
  }

  function getAuthHeaders() {
    if (!authToken) {
      return {};
    }

    return {
      Authorization: `Bearer ${authToken}`,
    };
  }

  function updateDashboardVisibility() {
    const role = currentUser?.role;
    const isStaff = role === "staff";
    const isAdmin = role === "admin";
    const isStudent = role === "student";

    loginPanel.classList.toggle("hidden", Boolean(currentUser));
    logoutBtn.classList.toggle("hidden", !currentUser);
    studentDashboard.classList.toggle("hidden", !isStudent);
    staffDashboard.classList.toggle("hidden", !(isStaff || isAdmin));
    adminDashboard.classList.toggle("hidden", !isAdmin);

    if (currentUser) {
      sessionLabel.textContent = `Signed in as ${currentUser.username} (${currentUser.role})`;
    } else {
      sessionLabel.textContent = "Not signed in";
    }
  }

  async function refreshSession() {
    if (!authToken) {
      currentUser = null;
      updateDashboardVisibility();
      return;
    }

    try {
      const response = await fetch("/auth/me", {
        headers: {
          ...getAuthHeaders(),
        },
      });

      if (!response.ok) {
        authToken = "";
        currentUser = null;
        localStorage.removeItem("authToken");
      } else {
        currentUser = await response.json();
      }
    } catch (error) {
      currentUser = null;
    }

    updateDashboardVisibility();
  }

  // Function to fetch activities from API
  async function fetchActivities() {
    try {
      const response = await fetch("/activities");
      const activities = await response.json();

      // Clear loading message
      activitiesList.innerHTML = "";
      activitySelect.innerHTML = '<option value="">-- Select an activity --</option>';

      const canManageParticipants =
        currentUser?.role === "staff" || currentUser?.role === "admin";

      // Populate activities list
      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";

        const spotsLeft =
          details.max_participants - details.participants.length;

        // Create participants HTML with delete icons instead of bullet points
        const participantsHTML =
          details.participants.length > 0
            ? `<div class="participants-section">
              <h5>Participants:</h5>
              <ul class="participants-list">
                ${details.participants
                  .map((email) => {
                    const removeButton = canManageParticipants
                      ? `<button class="delete-btn" data-activity="${name}" data-email="${email}">❌</button>`
                      : "";
                    return `<li><span class="participant-email">${email}</span>${removeButton}</li>`;
                  })
                  .join("")}
              </ul>
            </div>`
            : `<p><em>No participants yet</em></p>`;

        activityCard.innerHTML = `
          <h4>${name}</h4>
          <p>${details.description}</p>
          <p><strong>Schedule:</strong> ${details.schedule}</p>
          <p><strong>Availability:</strong> ${spotsLeft} spots left</p>
          <div class="participants-container">
            ${participantsHTML}
          </div>
        `;

        activitiesList.appendChild(activityCard);

        // Add option to select dropdown
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });

      // Add event listeners to delete buttons
      if (canManageParticipants) {
        document.querySelectorAll(".delete-btn").forEach((button) => {
          button.addEventListener("click", handleUnregister);
        });
      }
    } catch (error) {
      activitiesList.innerHTML =
        "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  // Handle unregister functionality
  async function handleUnregister(event) {
    const button = event.target;
    const activity = button.getAttribute("data-activity");
    const email = button.getAttribute("data-email");

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/unregister?email=${encodeURIComponent(email)}`,
        {
          method: "DELETE",
          headers: {
            ...getAuthHeaders(),
          },
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage("success", result.message);

        // Refresh activities list to show updated participants
        fetchActivities();
      } else {
        showMessage("error", result.detail || "An error occurred");
      }
    } catch (error) {
      showMessage("error", "Failed to unregister. Please try again.");
      console.error("Error unregistering:", error);
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        showMessage("error", result.detail || "Login failed");
        return;
      }

      authToken = result.token;
      localStorage.setItem("authToken", authToken);
      currentUser = {
        username: result.username,
        role: result.role,
      };
      updateDashboardVisibility();
      loginForm.reset();
      showMessage("success", `Welcome ${currentUser.username}`);
      fetchActivities();
    } catch (error) {
      showMessage("error", "Login failed. Please try again.");
      console.error("Error logging in:", error);
    }
  });

  logoutBtn.addEventListener("click", async () => {
    try {
      await fetch("/auth/logout", {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
        },
      });
    } catch (error) {
      console.error("Error logging out:", error);
    }

    authToken = "";
    currentUser = null;
    localStorage.removeItem("authToken");
    updateDashboardVisibility();
    showMessage("info", "Logged out");
    fetchActivities();
  });

  // Handle staff/admin registration form submission
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value;
    const activity = document.getElementById("activity").value;

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/signup?email=${encodeURIComponent(email)}`,
        {
          method: "POST",
          headers: {
            ...getAuthHeaders(),
          },
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage("success", result.message);
        signupForm.reset();

        // Refresh activities list to show updated participants
        fetchActivities();
      } else {
        showMessage("error", result.detail || "An error occurred");
      }
    } catch (error) {
      showMessage("error", "Failed to sign up. Please try again.");
      console.error("Error signing up:", error);
    }
  });

  createActivityForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      name: document.getElementById("new-activity-name").value,
      description: document.getElementById("new-activity-description").value,
      schedule: document.getElementById("new-activity-schedule").value,
      max_participants: Number(document.getElementById("new-activity-max").value),
    };

    try {
      const response = await fetch("/admin/activities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.ok) {
        showMessage("success", result.message);
        createActivityForm.reset();
        fetchActivities();
      } else {
        showMessage("error", result.detail || "Failed to create activity");
      }
    } catch (error) {
      showMessage("error", "Failed to create activity. Please try again.");
      console.error("Error creating activity:", error);
    }
  });

  // Initialize app
  refreshSession().then(fetchActivities);
});
