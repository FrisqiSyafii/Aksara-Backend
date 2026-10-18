// ========================================
// KONFIGURASI API
// ========================================

const API_URL = "http://localhost:5000/api";



// ========================================
// REQUEST UTAMA
// ========================================

const apiRequest = async (
  endpoint,
  options = {}
) => {

    console.log(
      "API Request:",
      `${API_URL}${endpoint}`,
      options
    );


  const token =
    localStorage.getItem("token");



  const response =
    await fetch(
      `${API_URL}${endpoint}`,
      {

        ...options,

        headers: {

          "Content-Type":
            "application/json",


          ...(token && {
            Authorization:
              `Bearer ${token}`,
          }),

        },

      }
    );



  const data =
    await response.json();



  if (!response.ok) {

    throw new Error(
      data.message ||
      "Terjadi kesalahan server."
    );

  }



  return data;

};





// ========================================
// GET
// ========================================

export const apiGet = (
  endpoint
) => {

  return apiRequest(
    endpoint,
    {
      method: "GET",
    }
  );

};





// ========================================
// POST
// ========================================

export const apiPost = (
  endpoint,
  body
) => {

  return apiRequest(
    endpoint,
    {

      method: "POST",

      body:
        JSON.stringify(body),

    }
  );

};





// ========================================
// PUT
// ========================================

export const apiPut = (
  endpoint,
  body
) => {

  return apiRequest(
    endpoint,
    {

      method: "PUT",

      body:
        JSON.stringify(body),

    }
  );

};





// ========================================
// DELETE
// ========================================

export const apiDelete = (
  endpoint
) => {

  return apiRequest(
    endpoint,
    {
      method: "DELETE",
    }
  );

};