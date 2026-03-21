import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, addDoc, doc, getDoc, updateDoc, setDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { customAlphabet } from 'nanoid';
import QRCode from 'qrcode';

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
const generateSlug = customAlphabet(ALPHABET, 7);

export default function CreateQR() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  
  const [formData, setFormData] = useState({
    title: '',
    destination_url: '',
    is_active: true,
    style: {
      dot_color: '#000000',
      bg_color: '#FFFFFF',
      dot_style: 'square',
    }
  });

  useEffect(() => {
    if (id) {
      const fetchQR = async () => {
        const docRef = doc(db, 'qr_codes', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setFormData(docSnap.data() as any);
        }
      };
      fetchQR();
    }
  }, [id]);

  useEffect(() => {
    const generatePreview = async () => {
      if (!formData.destination_url) {
        setQrDataUrl('');
        return;
      }
      try {
        const url = await QRCode.toDataURL(formData.destination_url, {
          color: {
            dark: formData.style.dot_color,
            light: formData.style.bg_color,
          },
          margin: 1,
          width: 300,
        });
        setQrDataUrl(url);
      } catch (err) {
        console.error(err);
      }
    };
    generatePreview();
  }, [formData.destination_url, formData.style]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setLoading(true);

    try {
      if (id) {
        // Update
        const docRef = doc(db, 'qr_codes', id);
        await updateDoc(docRef, {
          ...formData,
          updated_at: serverTimestamp(),
        });
      } else {
        // Create
        let slug = '';
        let success = false;
        let attempts = 0;
        
        while (!success && attempts < 10) {
          slug = generateSlug();
          try {
            const docRef = doc(db, 'qr_codes', slug);
            // We use setDoc instead of addDoc to specify the document ID
            // We can't check if it exists because of security rules, so we just try to create it.
            // Wait, we need to import setDoc
            await setDoc(docRef, {
              ...formData,
              slug,
              user_uid: auth.currentUser.uid,
              type: 'url',
              created_at: serverTimestamp(),
              updated_at: serverTimestamp(),
            });
            success = true;
          } catch (e: any) {
            // If it fails due to permissions, it might mean the document already exists
            // because our rules will prevent overwriting.
            attempts++;
          }
        }

        if (!success) throw new Error('Failed to generate unique slug');
      }
      navigate('/');
    } catch (error) {
      console.error('Error saving QR code:', error);
      alert('Failed to save QR code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-zinc-900 mb-8">
        {id ? 'Edit QR Code' : 'Create New QR Code'}
      </h1>

      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
              <div className="sm:col-span-4">
                <label htmlFor="title" className="block text-sm font-medium text-zinc-700">
                  Title
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    name="title"
                    id="title"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-zinc-300 rounded-md p-2 border"
                    placeholder="e.g., Restaurant Menu"
                  />
                </div>
              </div>

              <div className="sm:col-span-6">
                <label htmlFor="destination_url" className="block text-sm font-medium text-zinc-700">
                  Destination URL
                </label>
                <div className="mt-1">
                  <input
                    type="url"
                    name="destination_url"
                    id="destination_url"
                    required
                    value={formData.destination_url}
                    onChange={(e) => setFormData({ ...formData, destination_url: e.target.value })}
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-zinc-300 rounded-md p-2 border"
                    placeholder="https://example.com"
                  />
                </div>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="dot_color" className="block text-sm font-medium text-zinc-700">
                  Dot Color
                </label>
                <div className="mt-1 flex items-center space-x-2">
                  <input
                    type="color"
                    name="dot_color"
                    id="dot_color"
                    value={formData.style.dot_color}
                    onChange={(e) => setFormData({
                      ...formData,
                      style: { ...formData.style, dot_color: e.target.value }
                    })}
                    className="h-8 w-8 rounded border border-zinc-300 cursor-pointer"
                  />
                  <span className="text-sm text-zinc-500">{formData.style.dot_color}</span>
                </div>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="bg_color" className="block text-sm font-medium text-zinc-700">
                  Background Color
                </label>
                <div className="mt-1 flex items-center space-x-2">
                  <input
                    type="color"
                    name="bg_color"
                    id="bg_color"
                    value={formData.style.bg_color}
                    onChange={(e) => setFormData({
                      ...formData,
                      style: { ...formData.style, bg_color: e.target.value }
                    })}
                    className="h-8 w-8 rounded border border-zinc-300 cursor-pointer"
                  />
                  <span className="text-sm text-zinc-500">{formData.style.bg_color}</span>
                </div>
              </div>

              <div className="sm:col-span-6">
                <div className="flex items-start">
                  <div className="flex items-center h-5">
                    <input
                      id="is_active"
                      name="is_active"
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-zinc-300 rounded"
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label htmlFor="is_active" className="font-medium text-zinc-700">
                      Active
                    </label>
                    <p className="text-zinc-500">If inactive, the QR code will show a "Not Found" message.</p>
                  </div>
                </div>
              </div>
            </div>

            {qrDataUrl && (
              <div className="mt-6 border-t border-zinc-200 pt-6">
                <h3 className="text-lg font-medium text-zinc-900 mb-4">Preview</h3>
                <div className="flex justify-center bg-zinc-50 p-8 rounded-lg border border-zinc-200">
                  <img src={qrDataUrl} alt="QR Code Preview" className="w-48 h-48 shadow-sm rounded-md bg-white" />
                </div>
              </div>
            )}

            <div className="pt-5 border-t border-zinc-200 flex justify-end">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="bg-white py-2 px-4 border border-zinc-300 rounded-md shadow-sm text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
