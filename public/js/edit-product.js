// public/js/edit-product.js
document.addEventListener('DOMContentLoaded', function() {
    let cropper = null;
    let currentFileInput = null;
    const form = document.getElementById("editProductForm");
    const cropperModal = new bootstrap.Modal(document.getElementById('cropperModal'));
    const cropperImage = document.getElementById('cropperImage');
    const croppedImagesMap = new Map(); // Store cropped images per variant

    // Initialize croppedImagesMap with existing images
    document.querySelectorAll('.variant-group').forEach((group, index) => {
        const existingImages = Array.from(group.querySelectorAll('.existing-image img')).map(img => img.src);
        croppedImagesMap.set(index, existingImages);
    });

    // Handle image upload and cropping
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('variant-image-upload')) {
            const files = e.target.files;
            currentFileInput = e.target;
            const variantIndex = Array.from(document.querySelectorAll('.variant-group')).indexOf(currentFileInput.closest('.variant-group'));

            if (files.length > 0) {
                const existingImages = croppedImagesMap.get(variantIndex) || [];
                if (existingImages.length + files.length > 5) {
                    Swal.fire('Error', 'Maximum 5 images allowed per variant', 'error');
                    e.target.value = '';
                    return;
                }

                const file = files[0]; // Process one at a time
                const reader = new FileReader();

                reader.onload = function(e) {
                    cropperImage.src = e.target.result;
                    cropperModal.show();

                    if (cropper) cropper.destroy();

                    cropper = new Cropper(cropperImage, {
                        aspectRatio: NaN,
                        viewMode: 2,
                        dragMode: 'move',
                        responsive: true,
                        restore: true
                    });
                };

                reader.readAsDataURL(file);
            }
        }
    });

    // Handle crop button click
    document.getElementById('cropButton').addEventListener('click', function() {
        if (cropper) {
            const variantIndex = Array.from(document.querySelectorAll('.variant-group')).indexOf(currentFileInput.closest('.variant-group'));
            const container = currentFileInput.closest('.variant-group').querySelector('.image-preview');

            const canvas = cropper.getCroppedCanvas({ width: 800, height: 800 });
            canvas.toBlob(blob => {
                const thumbnail = document.createElement('div');
                thumbnail.className = 'preview-thumbnail existing-image';
                const img = document.createElement('img');
                img.src = URL.createObjectURL(blob);
                img.style.width = '100px';
                img.style.height = '100px';
                thumbnail.appendChild(img);

                const deleteBtn = document.createElement('span');
                deleteBtn.className = 'delete-image';
                deleteBtn.innerHTML = '×';
                deleteBtn.onclick = () => thumbnail.remove();
                thumbnail.appendChild(deleteBtn);

                container.appendChild(thumbnail);

                const file = new File([blob], `cropped-image-${Date.now()}.jpg`, { type: 'image/jpeg' });
                const currentImages = croppedImagesMap.get(variantIndex) || [];
                currentImages.push(file);
                croppedImagesMap.set(variantIndex, currentImages);

                cropperModal.hide();
                cropper.destroy();
                cropper = null;
            }, 'image/jpeg', 0.9);
        }
    });

    // Form submission
    form.addEventListener("submit", async function(e) {
        e.preventDefault();

        const productId = document.getElementById("productId").value;
        const formData = new FormData();

        formData.append('productName', document.getElementById('productName').value);
        formData.append('description', document.getElementById('description').value);
        formData.append('category', document.getElementById('category').value);
        formData.append('brand', document.getElementById('brand').value);

        const variantGroups = document.querySelectorAll('.variant-group');
        variantGroups.forEach((group, index) => {
            formData.append(`variantName[${index}]`, group.querySelector('[name="variantName"]').value);
            formData.append(`variantColor[${index}]`, group.querySelector('[name="variantColor"]').value);
            formData.append(`variantPrice[${index}]`, group.querySelector('[name="variantPrice"]').value);
            formData.append(`variantStock[${index}]`, group.querySelector('[name="variantStock"]').value);

            const images = croppedImagesMap.get(index) || [];
            images.forEach((image, imgIndex) => {
                if (typeof image === 'string') { // Existing image URL
                    formData.append(`variantImages[${index}]`, image);
                } else { // New cropped image file
                    formData.append(`variantImages[${index}]`, image);
                }
            });
        });

        console.log("🚀 Form Data Contents:");
        for (let pair of formData.entries()) {
            console.log(`🔹 ${pair[0]}:`, pair[1]);
        }

        try {
            Swal.fire({
                title: 'Updating Product...',
                text: 'Please wait while we update the product details',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            const response = await fetch(`/admin/products/edit/${productId}`, {
                method: "PUT",
                body: formData
            });

            const result = await response.json();
            if (response.ok && result.success) {
                Swal.fire({
                    icon: 'success',
                    title: 'Success!',
                    text: result.message,
                    showConfirmButton: true
                }).then(() => {
                    window.location.href = "/admin/products";
                });
            } else {
                throw new Error(result.message || 'Failed to update product');
            }
        } catch (error) {
            console.error("❌ Error:", error);
            Swal.fire({
                icon: 'error',
                title: 'Error!',
                text: error.message || 'Error updating product',
                showConfirmButton: true
            });
        }
    });

    // Handle delete image functionality
    document.querySelectorAll('.delete-image').forEach(button => {
        button.addEventListener('click', async function() {
            const variantIndex = this.dataset.variant;
            const imageIndex = this.dataset.image;
            const productId = document.getElementById('productId').value;

            try {
                const willDelete = await Swal.fire({
                    title: 'Are you sure?',
                    text: "This image will be permanently deleted!",
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#3085d6',
                    cancelButtonColor: '#d33',
                    confirmButtonText: 'Yes, delete it!'
                });

                if (willDelete.isConfirmed) {
                    const response = await fetch(`/admin/products/${productId}/variant/${variantIndex}/image/${imageIndex}`, {
                        method: 'DELETE'
                    });

                    const result = await response.json();
                    if (response.ok && result.success) {
                        this.closest('.existing-image').remove();
                        const images = croppedImagesMap.get(parseInt(variantIndex));
                        images.splice(parseInt(imageIndex), 1);
                        croppedImagesMap.set(parseInt(variantIndex), images);
                        Swal.fire('Deleted!', 'The image has been deleted.', 'success');
                    } else {
                        throw new Error(result.message || 'Failed to delete image');
                    }
                }
            } catch (error) {
                console.error('❌ Error deleting image:', error);
                Swal.fire('Error!', error.message || 'Failed to delete image', 'error');
            }
        });
    });

    window.addVariant = function() {
        const variantsContainer = document.getElementById('variantsContainer');
        const newVariantIndex = variantsContainer.children.length;

        const variantHTML = `
            <div class="variant-group mb-3">
                <div class="row">
                    <div class="col-md-3">
                        <label class="form-label">Color Name</label>
                        <input type="text" name="variantName" class="form-control" required>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label">Color</label>
                        <input type="color" name="variantColor" class="form-control" required>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label">Price</label>
                        <input type="number" name="variantPrice" class="form-control" required>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label">Stock</label>
                        <input type="number" name="variantStock" class="form-control" required>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">Product Images (1-5)</label>
                        <input type="file" name="variantImages" class="form-control variant-image-upload" multiple accept="image/*">
                        <div class="image-preview-container mt-2">
                            <div class="image-preview"></div>
                        </div>
                    </div>
                    <div class="col-12 mt-2">
                        <button type="button" class="btn btn-danger btn-sm remove-variant">Remove Variant</button>
                    </div>
                </div>
            </div>
        `;

        variantsContainer.insertAdjacentHTML('beforeend', variantHTML);
        croppedImagesMap.set(newVariantIndex, []);
    };

    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('remove-variant')) {
            const variantGroup = e.target.closest('.variant-group');
            const variantIndex = Array.from(document.querySelectorAll('.variant-group')).indexOf(variantGroup);
            croppedImagesMap.delete(variantIndex);
            variantGroup.remove();
        }
    });
});