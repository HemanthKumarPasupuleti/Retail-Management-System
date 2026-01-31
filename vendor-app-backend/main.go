package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	_ "github.com/lib/pq"
	"github.com/rs/cors"
)

type Vendor struct {
	ID      int    `json:"id"`
	Name    string `json:"name"`
	Address string `json:"address"`
	Phone   string `json:"phone"`
	Email   string `json:"email"`
}

type PO struct {
	ID     int    `json:"id"`
	PO     int    `json:"po"`
	Amount int    `json:"amount"`
	Vendor string `json:"vendor"`
	Status string `json:"status"`
}

var db *sql.DB

func main() {
	var err error
	// Update connection string with your DB credentials
	connStr := "host=localhost port=5432 user=postgres  password=2129 dbname=vendor_app sslmode=disable"
	db, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	if err := ensureSchema(db); err != nil {
		log.Fatal(err)
	}

	router := mux.NewRouter()

	router.HandleFunc("/vendors", getVendors).Methods("GET")
	router.HandleFunc("/vendors", createVendor).Methods("POST")
	router.HandleFunc("/vendors/{id}", updateVendor).Methods("PUT")
	router.HandleFunc("/vendors/{id}", deleteVendor).Methods("DELETE")

	router.HandleFunc("/pos", getPOs).Methods("GET")
	router.HandleFunc("/pos", createPO).Methods("POST")
	router.HandleFunc("/pos/{id}/revise", revisePO).Methods("PUT")
	router.HandleFunc("/pos/{id}/archive", archivePO).Methods("PUT")
	router.HandleFunc("/pos/{id}", deletePO).Methods("DELETE")

	router.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Vendor API is running"))
	}).Methods("GET")

	// Enable CORS for frontend - list explicit origins when allowing credentials
	handler := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "http://localhost:3002"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	}).Handler(router)

	log.Println("Server started at :8080")
	log.Fatal(http.ListenAndServe(":8080", handler))
}

func ensureSchema(db *sql.DB) error {
	vendorTable := `
        CREATE TABLE IF NOT EXISTS vendors (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            address TEXT,
            phone TEXT,
            email TEXT
        );`
	poTable := `
        CREATE TABLE IF NOT EXISTS purchase_orders (
            id SERIAL PRIMARY KEY,
            po INT UNIQUE NOT NULL,
            amount INT NOT NULL,
            vendor VARCHAR(50) NOT NULL,
            status VARCHAR(50) NOT NULL
        );
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'purchase_orders' AND column_name = 'number'
            ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'purchase_orders' AND column_name = 'po'
            ) THEN
                EXECUTE 'ALTER TABLE purchase_orders RENAME COLUMN number TO po';
            END IF;
        END$$;
        ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS po INT;
        ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS amount INT NOT NULL DEFAULT 0;
        ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS vendor VARCHAR(50) NOT NULL DEFAULT '';
        ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'Open';
        ALTER TABLE purchase_orders DROP COLUMN IF EXISTS vendor_id;
        ALTER TABLE purchase_orders DROP COLUMN IF EXISTS vendorid;
        ALTER TABLE purchase_orders DROP COLUMN IF EXISTS number;
        `

	if _, err := db.Exec(vendorTable); err != nil {
		return err
	}
	if _, err := db.Exec(poTable); err != nil {
		return err
	}
	return nil
}

func getVendors(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query("SELECT id, name, address, phone, email FROM vendors")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	vendors := []Vendor{}
	for rows.Next() {
		var v Vendor
		if err := rows.Scan(&v.ID, &v.Name, &v.Address, &v.Phone, &v.Email); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		vendors = append(vendors, v)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(vendors)
}

func createVendor(w http.ResponseWriter, r *http.Request) {
	var v Vendor
	if err := json.NewDecoder(r.Body).Decode(&v); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	err := db.QueryRow(
		"INSERT INTO vendors (name, address, phone, email) VALUES ($1, $2, $3, $4) RETURNING id",
		v.Name, v.Address, v.Phone, v.Email).Scan(&v.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(v)
}

func updateVendor(w http.ResponseWriter, r *http.Request) {
	idParam := mux.Vars(r)["id"]
	id, err := strconv.Atoi(idParam)
	if err != nil {
		http.Error(w, "invalid vendor id", http.StatusBadRequest)
		return
	}

	var v Vendor
	if err := json.NewDecoder(r.Body).Decode(&v); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	_, err = db.Exec(
		"UPDATE vendors SET name=$1, address=$2, phone=$3, email=$4 WHERE id=$5",
		v.Name, v.Address, v.Phone, v.Email, id,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	v.ID = id
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func deleteVendor(w http.ResponseWriter, r *http.Request) {
	idParam := mux.Vars(r)["id"]
	id, err := strconv.Atoi(idParam)
	if err != nil {
		http.Error(w, "invalid vendor id", http.StatusBadRequest)
		return
	}

	if _, err := db.Exec("DELETE FROM vendors WHERE id=$1", id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func getPOs(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query("SELECT id, po, amount, vendor, status FROM purchase_orders ORDER BY id DESC")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	pos := []PO{}
	for rows.Next() {
		var p PO
		if err := rows.Scan(&p.ID, &p.PO, &p.Amount, &p.Vendor, &p.Status); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		pos = append(pos, p)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pos)
}

func createPO(w http.ResponseWriter, r *http.Request) {
	var p PO
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	err := db.QueryRow(
		"INSERT INTO purchase_orders (po, amount, vendor, status) VALUES ($1, $2, $3, COALESCE($4,'Open')) RETURNING id, status",
		p.PO, p.Amount, p.Vendor, p.Status,
	).Scan(&p.ID, &p.Status)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(p)
}

func revisePO(w http.ResponseWriter, r *http.Request) {
	idParam := mux.Vars(r)["id"]
	id, err := strconv.Atoi(idParam)
	if err != nil {
		http.Error(w, "invalid po id", http.StatusBadRequest)
		return
	}

	var p PO
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	_, err = db.Exec(
		"UPDATE purchase_orders SET po=$1, amount=$2, vendor=$3, status=COALESCE($4, status) WHERE id=$5",
		p.PO, p.Amount, p.Vendor, p.Status, id,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	p.ID = id
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(p)
}

func archivePO(w http.ResponseWriter, r *http.Request) {
	idParam := mux.Vars(r)["id"]
	id, err := strconv.Atoi(idParam)
	if err != nil {
		http.Error(w, "invalid po id", http.StatusBadRequest)
		return
	}

	_, err = db.Exec("UPDATE purchase_orders SET status='Archived' WHERE id=$1", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func deletePO(w http.ResponseWriter, r *http.Request) {
	idParam := mux.Vars(r)["id"]
	id, err := strconv.Atoi(idParam)
	if err != nil {
		http.Error(w, "invalid po id", http.StatusBadRequest)
		return
	}

	if _, err := db.Exec("DELETE FROM purchase_orders WHERE id=$1", id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
