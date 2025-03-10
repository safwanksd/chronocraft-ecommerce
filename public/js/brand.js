// brand.js
document.getElementById("addBrandForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    
    const response = await fetch("/admin/brands/add", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            brandName: document.getElementById("brandName").value
        })
    });

    const result = await response.json();
    Swal.fire(result.success ? "Added!" : "Error!", result.success || result.error, result.success ? "success" : "error")
        .then(() => { if (result.success) window.location.reload(); });
});


async function editBrand(id) {
    window.location.href = `/admin/brands/edit/${id}`;
}

async function toggleBrandStatus(id) {
    Swal.fire({
        title: "Are you sure?",
        text: "You want to change this brand's status!",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
        confirmButtonText: "Yes, change it!"
    }).then(async (result) => {
        if (result.isConfirmed) {
            const response = await fetch("/admin/brands/block-unblock", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id })
            });

            const result = await response.json();
            Swal.fire(result.success ? "Updated!" : "Error!", result.success || result.error, result.success ? "success" : "error")
                .then(() => { if (result.success) window.location.reload(); });
        }
    });
}

async function deleteBrand(id) {
    Swal.fire({
        title: "Are you sure?",
        text: "This action cannot be undone!",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        cancelButtonColor: "#3085d6",
        confirmButtonText: "Yes, delete it!"
    }).then(async (result) => {
        if (result.isConfirmed) {
            const response = await fetch("/admin/brands/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id })
            });

            const result = await response.json();
            Swal.fire(result.success ? "Deleted!" : "Error!", result.success || result.error, result.success ? "success" : "error")
                .then(() => { if (result.success) window.location.reload(); });
        }
    });
}
