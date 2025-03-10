document.addEventListener("DOMContentLoaded", function () {
    let currentCropper = null;
    let currentImageInput = null;
    let currentPreviewContainer = null;
    let currentFiles = [];
    const cropperModal = document.getElementById('cropperModal') ? 
        new bootstrap.Modal(document.getElementById('cropperModal')) : null;
    const cropperImage = document.getElementById('cropperImage');
    let cropperToolbar = null; // Single toolbar instance to prevent duplicates

    // Store cropped images for each variant
    const croppedImagesMap = new Map();

    // ✅ Add New Variant Dynamically
    window.addVariant = function () {
        const container = document.getElementById("variantsContainer");
        const variantTemplate = document.querySelector('.variant-group').cloneNode(true);

        // Clear input values
        variantTemplate.querySelectorAll('input').forEach(input => {
            input.value = '';
        });
        variantTemplate.querySelector('.image-preview').innerHTML = '';

        // Add remove button for new variants
        const removeButton = document.createElement('div');
        removeButton.className = 'col-12 mt-2';
        removeButton.innerHTML = `
            <button type="button" class="btn btn-danger btn-sm remove-variant">
                Remove Variant
            </button>
        `;
        variantTemplate.querySelector('.row').appendChild(removeButton);

        container.appendChild(variantTemplate);
    };

    // ✅ Handle Product Status Toggle
    const statusToggles = document.querySelectorAll('.status-toggle');
    if (statusToggles.length > 0) {
        statusToggles.forEach(toggle => {
            toggle.addEventListener('change', async function() {
                const productId = this.dataset.productId;
                const isBlocked = !this.checked;

                try {
                    const response = await fetch(`/admin/products/update-status/${productId}`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ isBlocked })
                    });

                    const result = await response.json();

                    if (result.success) {
                        const label = this.closest('.form-check').querySelector('.form-check-label');
                        label.textContent = isBlocked ? 'Blocked' : 'Active';

                        Swal.fire({
                            icon: 'success',
                            title: 'Status Updated!',
                            text: `Product has been ${isBlocked ? 'blocked' : 'unblocked'} successfully.`,
                            showConfirmButton: false,
                            timer: 1500
                        });
                    } else {
                        throw new Error(result.message || 'Failed to update status');
                    }
                } catch (error) {
                    console.error('Error updating status:', error);
                    this.checked = !this.checked;
                    
                    Swal.fire({
                        icon: 'error',
                        title: 'Error!',
                        text: error.message || 'Failed to update product status',
                        confirmButtonText: 'OK'
                    });
                }
            });
        });
    }

    // ✅ Handle Image Upload & Cropping
    document.addEventListener("change", async function (event) {
        if (event.target.classList.contains("variant-image-upload")) {
            const input = event.target;
            const files = Array.from(input.files);
            const variantGroup = input.closest('.variant-group');
            const variantIndex = Array.from(document.querySelectorAll('.variant-group')).indexOf(variantGroup);
            currentImageInput = input;
            currentPreviewContainer = variantGroup.querySelector('.image-preview');

            // Get existing images count
            const existingImages = croppedImagesMap.get(variantIndex) || [];
            const totalImages = existingImages.length + files.length;

            if (totalImages > 5) {
                Swal.fire("Error", "Maximum 5 images allowed per variant", "error");
                input.value = '';
                return;
            }

            currentFiles = files;

            if (!croppedImagesMap.has(variantIndex)) {
                croppedImagesMap.set(variantIndex, []);
            }

            if (files.length > 0) {
                processNextImage(variantIndex);
            }
        }
    });

    function processNextImage(variantIndex) {
        if (currentFiles.length > 0) {
            const file = currentFiles.shift();

            if (!file.type.startsWith('image/')) {
                Swal.fire("Error", "Only image files are allowed", "error");
                processNextImage(variantIndex);
                return;
            }

            const reader = new FileReader();
            reader.onload = function (e) {
                cropperImage.src = e.target.result;
                cropperModal.show();

                // Destroy existing cropper instance if it exists
                if (currentCropper) {
                    currentCropper.destroy();
                }

                // Remove existing toolbar if it exists
                const modalBody = document.querySelector('.modal-body');
                if (cropperToolbar) {
                    modalBody.removeChild(cropperToolbar);
                }

                // Create and append new toolbar
                cropperToolbar = document.createElement('div');
                cropperToolbar.className = 'cropper-toolbar mt-2';
                cropperToolbar.innerHTML = `
                    <button type="button" class="btn btn-sm btn-secondary me-2" id="zoomIn">
                        <i class="fas fa-search-plus"></i> Zoom In
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary me-2" id="zoomOut">
                        <i class="fas fa-search-minus"></i> Zoom Out
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary me-2" id="rotateLeft">
                        <i class="fas fa-undo"></i> Rotate Left
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary" id="rotateRight">
                        <i class="fas fa-redo"></i> Rotate Right
                    </button>
                `;
                modalBody.insertBefore(cropperToolbar, modalBody.querySelector('.img-container').nextSibling);

                // Initialize Cropper
                currentCropper = new Cropper(cropperImage, {
                    viewMode: 2,
                    dragMode: 'move',
                    aspectRatio: NaN,
                    autoCropArea: 0.8,
                    restore: false,
                    guides: true,
                    center: true,
                    highlight: true,
                    cropBoxMovable: true,
                    cropBoxResizable: true,
                    toggleDragModeOnDblclick: true,
                    responsive: true,
                    background: true,
                    modal: true,
                    zoomable: true,
                    zoomOnWheel: true,
                    wheelZoomRatio: 0.1,
                    data: {
                        width: '80%',
                        height: '80%'
                    }
                });

                // Add event listeners to toolbar buttons
                document.getElementById('zoomIn').addEventListener('click', () => currentCropper.zoom(0.1));
                document.getElementById('zoomOut').addEventListener('click', () => currentCropper.zoom(-0.1));
                document.getElementById('rotateLeft').addEventListener('click', () => currentCropper.rotate(-90));
                document.getElementById('rotateRight').addEventListener('click', () => currentCropper.rotate(90));
            };
            reader.readAsDataURL(file);
        }
    }

    // ✅ Handle Cropping & Saving Images
    if (document.getElementById('cropButton')) {
        document.getElementById('cropButton').addEventListener('click', function () {
            if (!currentCropper) return;

            const variantGroup = currentImageInput.closest('.variant-group');
            const variantIndex = Array.from(document.querySelectorAll('.variant-group')).indexOf(variantGroup);

            const canvas = currentCropper.getCroppedCanvas({
                width: 800,
                height: 800,
                fillColor: '#fff',
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high',
            });

            const thumbnail = document.createElement('div');
            thumbnail.className = 'preview-thumbnail';

            const img = document.createElement('img');
            img.src = canvas.toDataURL('image/jpeg', 0.9);
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';

            const deleteBtn = document.createElement('span');
            deleteBtn.className = 'delete-image';
            deleteBtn.innerHTML = '×';
            deleteBtn.onclick = function () {
                const imageIndex = Array.from(currentPreviewContainer.children).indexOf(thumbnail);
                const images = croppedImagesMap.get(variantIndex) || [];
                images.splice(imageIndex, 1);
                croppedImagesMap.set(variantIndex, images);
                thumbnail.remove();
            };

            thumbnail.appendChild(img);
            thumbnail.appendChild(deleteBtn);
            currentPreviewContainer.appendChild(thumbnail);

            canvas.toBlob(function (blob) {
                const croppedImage = new File([blob], `cropped-image-${Date.now()}.jpg`, { type: 'image/jpeg' });
                const currentImages = croppedImagesMap.get(variantIndex) || [];
                currentImages.push(croppedImage);
                croppedImagesMap.set(variantIndex, currentImages);

                currentCropper.destroy();
                currentCropper = null;
                cropperModal.hide();
                processNextImage(variantIndex);
            }, 'image/jpeg', 0.9);
        });
    }

    // ✅ Handle Product Delete
    const deleteButtons = document.querySelectorAll('.delete-product');
    if (deleteButtons.length > 0) {
        deleteButtons.forEach(button => {
            button.addEventListener('click', async function() {
                const productId = this.dataset.productId;

                const result = await Swal.fire({
                    title: 'Are you sure?',
                    text: "You won't be able to revert this!",
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#3085d6',
                    cancelButtonColor: '#d33',
                    confirmButtonText: 'Yes, delete it!'
                });

                if (result.isConfirmed) {
                    try {
                        const response = await fetch(`/admin/products/delete/${productId}`, {
                            method: 'DELETE'
                        });

                        const data = await response.json();

                        if (data.success) {
                            Swal.fire(
                                'Deleted!',
                                'Product has been deleted.',
                                'success'
                            ).then(() => {
                                this.closest('tr').remove();
                            });
                        } else {
                            throw new Error(data.message);
                        }
                    } catch (error) {
                        Swal.fire(
                            'Error!',
                            error.message || 'Failed to delete product',
                            'error'
                        );
                    }
                }
            });
        });
    }

    // ✅ Handle Form Submission
    const addProductForm = document.getElementById("addProductForm");
    if (addProductForm) {
        addProductForm.addEventListener("submit", async function (e) {
            e.preventDefault();

            try {
                Swal.fire({
                    title: 'Adding Product...',
                    text: 'Please wait while we process your request',
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                const formData = new FormData();

                formData.append('productName', this.querySelector('[name="productName"]').value);
                formData.append('description', this.querySelector('[name="description"]').value);
                formData.append('category', this.querySelector('[name="category"]').value);
                formData.append('brand', this.querySelector('[name="brand"]').value);

                const variants = document.querySelectorAll(".variant-group");
                
                variants.forEach((variantGroup, index) => {
                    const variantImages = croppedImagesMap.get(index) || [];
                    
                    if (variantImages.length === 0) {
                        throw new Error(`Please add at least one image for variant ${index + 1}`);
                    }

                    formData.append(`variantName[${index}]`, variantGroup.querySelector('[name="variantName"]').value);
                    formData.append(`variantColor[${index}]`, variantGroup.querySelector('[name="variantColor"]').value);
                    formData.append(`variantPrice[${index}]`, variantGroup.querySelector('[name="variantPrice"]').value);
                    formData.append(`variantSalePrice[${index}]`, variantGroup.querySelector('[name="variantSalePrice"]').value); // Add salePrice
                    formData.append(`variantStock[${index}]`, variantGroup.querySelector('[name="variantStock"]').value);

                    variantImages.forEach((file, imgIndex) => {
                        formData.append(`variantImages[${index}]`, file);
                    });
                });

                const response = await fetch("/admin/products/add", {
                    method: "POST",
                    body: formData
                });

                if (!response.ok) {
                    const result = await response.json();
                    throw new Error(result.message || 'Failed to add product');
                }

                const result = await response.json();

                Swal.fire({
                    icon: 'success',
                    title: 'Success!',
                    text: 'Product added successfully',
                    showConfirmButton: true
                }).then(() => {
                    window.location.href = "/admin/products";
                });

            } catch (error) {
                console.error("❌ Error:", error);
                Swal.fire({
                    icon: 'error',
                    title: 'Error!',
                    text: error.message || 'Failed to add product',
                    showConfirmButton: true
                });
            }
        });
    }

    // ✅ Handle removing variants
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('remove-variant')) {
            const variantGroup = e.target.closest('.variant-group');
            const variantIndex = Array.from(document.querySelectorAll('.variant-group')).indexOf(variantGroup);
            
            croppedImagesMap.delete(variantIndex);
            
            if (document.querySelectorAll('.variant-group').length > 1) {
                variantGroup.remove();
            } else {
                Swal.fire("Warning", "At least one variant is required", "warning");
            }
        }
    });
});