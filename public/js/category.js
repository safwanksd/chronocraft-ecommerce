document.getElementById("addCategoryForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const name = document.getElementById("categoryName").value.trim();
    const description = document.getElementById("categoryDescription").value.trim();

    if (!name) {
        Swal.fire("Warning!", "Category name cannot be empty!", "warning");
        return;
    }

    const response = await fetch("/admin/categories/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description })
    });

    const result = await response.json();
    if (result.success) {
        Swal.fire("Added!", result.success, "success").then(() => {
            window.location.reload();
        });
    } else {
        Swal.fire("Error!", result.error, "error");
    }
});

async function editCategory(id, currentName, currentDescription) {
    window.location.href = `/admin/categories/edit/${id}`;
}



async function updateCategoryStatus(id) {
    Swal.fire({
        title: "Are you sure?",
        text: "You want to change this category's status!",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
        confirmButtonText: "Yes, change it!"
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                // Add logging to verify the request
                console.log(`Sending request to update category ${id}`);
                
                const response = await fetch(`/admin/categories/update-status/${id}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" }
                });

                // Log the raw response
                console.log('Response status:', response.status);
                
                const result = await response.json();
                console.log('Response data:', result);

                if (result.success) {
                    const statusElement = document.getElementById(`status-${id}`);
                    const buttonElement = document.getElementById(`toggle-btn-${id}`);
                    
                    if (!statusElement || !buttonElement) {
                        console.error('Could not find status or button elements');
                        return;
                    }

                    statusElement.innerHTML = `
                        <span class="badge ${result.isListed ? 'bg-success' : 'bg-danger'}">
                            ${result.isListed ? 'Listed' : 'Unlisted'}
                        </span>
                    `;

                    buttonElement.className = `btn ${result.isListed ? 'btn-danger' : 'btn-success'}`;
                    buttonElement.textContent = result.isListed ? 'Unlist' : 'List';

                    Swal.fire("Updated!", result.success, "success");
                } else {
                    console.error('Error from server:', result.error);
                    Swal.fire("Error!", result.error || "Unknown error occurred", "error");
                }
            } catch (error) {
                console.error("Error updating category status:", error);
                Swal.fire("Error!", "Failed to update category status", "error");
            }
        }
    });
}

