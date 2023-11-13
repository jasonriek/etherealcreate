// Initialize Quill
const quill = new Quill('#editor-container', {
    theme: 'snow',
    modules: {
        toolbar: [
            ['bold', 'italic', 'underline'],        // custom font formatting
            [{ 'header': [1, 2, 3, 4, 5, 6] }],     // custom font formatting
            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
            ['link', 'image'],                       // image insertion
          ],
        imageResize: {} // Enable image resizing
    }
});

// Add an event listener to update the hidden input when the editor content changes
quill.on('text-change', function() {
    document.getElementById('hidden-editor-input').value = quill.root.innerHTML;
});