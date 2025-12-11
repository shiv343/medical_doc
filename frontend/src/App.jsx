import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [viewingPdf, setViewingPdf] = useState(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
  return () => {
    if (viewingPdf && viewingPdf.startsWith('blob:')) {
      window.URL.revokeObjectURL(viewingPdf);
    }
  };
}, [viewingPdf]);

  const fetchDocuments = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/documents');
      const data = await response.json();
      setDocuments(data);
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setMessage('');
    } else {
      setSelectedFile(null);
      setMessage('Please select a PDF file only');
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setMessage('Please select a file first');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('title', title || selectedFile.name);

    try {
      const response = await fetch('http://localhost:5000/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessage('File uploaded successfully!');
        setSelectedFile(null);
        setTitle('');
        document.getElementById('fileInput').value = '';
        fetchDocuments();
      } else {
        setMessage(data.error || 'Upload failed');
      }
    } catch (error) {
      setMessage('Error uploading file: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleView = async (id, filename) => {
   try {
    const response = await fetch(`http://localhost:5000/api/documents/${id}`);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    setViewingPdf(url);
  } catch (error) {
    setMessage('Error viewing file: ' + error.message);
  }
};

  const handleDownload = async (id, filename) => {
    try {
      const response = await fetch(`http://localhost:5000/api/documents/${id}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setMessage('File downloaded successfully!');
    } catch (error) {
      setMessage('Error downloading file: ' + error.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:5000/api/documents/${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessage('Document deleted successfully!');
        fetchDocuments();
      } else {
        setMessage(data.error || 'Delete failed');
      }
    } catch (error) {
      setMessage('Error deleting document: ' + error.message);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="App">
      <div className="container">
        <h1>Medical Documents Portal</h1>
        
        {/* Upload Form */}
        <div className="upload-section">
          <h2>Upload PDF Document</h2>
          <form onSubmit={handleUpload}>
            <div className="form-group">
              <label htmlFor="title">Document Title:</label>
              <input
                id="title"
                type="text"
                placeholder="e.g., Prescription, Test Results, Referral Notes"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label htmlFor="fileInput">Select PDF File:</label>
              <input
                id="fileInput"
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                disabled={loading}
              />
            </div>
            <button type="submit" disabled={loading || !selectedFile}>
              {loading ? 'Uploading...' : 'Upload Document'}
            </button>
          </form>
          {message && (
            <div className={message.includes('success') ? 'message success' : 'message error'}>
              {message}
            </div>
          )}
        </div>

        {/* Documents List */}
        <div className="documents-section">
          <h2>Your Documents ({documents.length})</h2>
          {documents.length === 0 ? (
            <p className="no-documents">No documents uploaded yet</p>
          ) : (
            <table className="documents-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Filename</th>
                  <th>Size</th>
                  <th>Upload Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td><strong>{doc.title || doc.filename}</strong></td>
                    <td>{doc.filename}</td>
                    <td>{formatFileSize(doc.filesize)}</td>
                    <td>{formatDate(doc.created_at)}</td>
                    <td>
                      <button
                        className="btn-view"
                        onClick={() => handleView(doc.id, doc.filename)}
                      >
                        View
                      </button>
                      <button
                        className="btn-download"
                        onClick={() => handleDownload(doc.id, doc.filename)}
                      >
                        Download
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => handleDelete(doc.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* PDF Viewer Modal */}
      {viewingPdf && (
         <div className="modal-overlay" onClick={() => setViewingPdf(null)}>
    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
      <button className="close-btn" onClick={() => setViewingPdf(null)}>✕</button>
      <object
        data={viewingPdf}
        type="application/pdf"
        width="100%"
        height="100%"
      > 
      <p>Unable to display PDF. <a href={viewingPdf} target="_blank" rel="noreferrer">Open in new tab</a></p>
         </object>
         </div>
        </div>
      )}
    </div>
  );
}

export default App;