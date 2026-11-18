#include <iostream>
#include <fstream>
#include <string>
#include <unordered_map>   // hash map
#include <stack>           // stack
#include <queue>           // queue
using namespace std;

const int MAX = 100;          // max products
const int LOW_STOCK = 5;      // below this, recommend restock
const string FILE_NAME = "products.txt";

// ---------------- OOP: Product ----------------
class Product {
public:
    int id;
    string name;
    double price;
    int qty;
    bool inQueue;     // already waiting in restock queue?

    Product() : id(0), name(""), price(0), qty(0), inQueue(false) {}
    Product(int i, string n, double p, int q) : id(i), name(n), price(p), qty(q), inQueue(false) {}

    void show() const {
        cout << id << "\t" << name << "\t" << price << "\t" << qty;
        if (qty < LOW_STOCK) cout << "\t<-- LOW STOCK";
        cout << endl;
    }
};

// ---------------- OOP: Sale ----------------
class Sale {
public:
    int productId;
    int qty;
    double total;
    Sale() : productId(0), qty(0), total(0) {}
    Sale(int p, int q, double t) : productId(p), qty(q), total(t) {}
};

// Linked list node for transaction history
struct Node {
    Sale sale;
    Node* next;
    Node(Sale s) : sale(s), next(NULL) {}
};

// ---------------- OOP: Inventory ----------------
class Inventory {
private:
    Product products[MAX];              // ARRAY
    int count;
    unordered_map<int, int> indexOf;    // HASH MAP: id -> position in array
    Node* history;                      // LINKED LIST (newest sale at head)
    stack<Sale> undoStack;              // STACK
    queue<int> restockQueue;            // QUEUE

public:
    Inventory() : count(0), history(NULL) {}

    ~Inventory() {
        while (history != NULL) {
            Node* t = history;
            history = history->next;
            delete t;
        }
    }

    // ----- add product -----
    void addProduct() {
        if (count >= MAX) { cout << "Inventory full!\n"; return; }
        int id, q; string name; double p;
        cout << "Enter ID: "; cin >> id;
        if (indexOf.count(id)) { cout << "ID already exists!\n"; return; }
        cout << "Enter name: "; cin >> name;
        cout << "Enter price: "; cin >> p;
        cout << "Enter quantity: "; cin >> q;
        products[count] = Product(id, name, p, q);
        indexOf[id] = count;
        count++;
        cout << "Product added.\n";
    }

    // ----- show all products -----
    void showAll() {
        if (count == 0) { cout << "No products yet.\n"; return; }
        cout << "ID\tName\tPrice\tQty\n";
        for (int i = 0; i < count; i++) products[i].show();
    }

    // ----- make a sale -----
    void makeSale() {
        int id, q;
        cout << "Enter product ID: "; cin >> id;
        if (!indexOf.count(id)) { cout << "Product not found!\n"; return; }
        Product& p = products[indexOf[id]];     // fast lookup using hash map
        cout << "Enter quantity: "; cin >> q;
        if (q <= 0 || q > p.qty) { cout << "Not enough stock!\n"; return; }

        p.qty -= q;
        Sale s(id, q, q * p.price);

        // add to history (linked list, insert at head)
        Node* n = new Node(s);
        n->next = history;
        history = n;

        // push on undo stack
        undoStack.push(s);

        // print bill
        cout << "\n----- BILL -----\n";
        cout << "Item : " << p.name << endl;
        cout << "Qty  : " << q << endl;
        cout << "Price: " << p.price << endl;
        cout << "Total: " << s.total << endl;
        cout << "----------------\n";

        // low stock -> add to restock queue
        if (p.qty < LOW_STOCK && !p.inQueue) {
            restockQueue.push(id);
            p.inQueue = true;
            cout << "Low stock! " << p.name << " added to restock queue.\n";
        }
    }

    // ----- undo last sale -----
    void undoSale() {
        if (undoStack.empty()) { cout << "Nothing to undo.\n"; return; }
        Sale s = undoStack.top();
        undoStack.pop();

        products[indexOf[s.productId]].qty += s.qty;   // give stock back

        // remove newest history node (head)
        Node* t = history;
        history = history->next;
        delete t;

        cout << "Last sale undone. Stock restored.\n";
    }

    // ----- show history -----
    void showHistory() {
        if (history == NULL) { cout << "No sales yet.\n"; return; }
        cout << "Product ID\tQty\tTotal\n";
        for (Node* t = history; t != NULL; t = t->next)
            cout << t->sale.productId << "\t\t" << t->sale.qty << "\t" << t->sale.total << endl;
    }

    // ----- restock queue (first come, first served) -----
    void processRestock() {
        if (restockQueue.empty()) { cout << "Restock queue is empty.\n"; return; }
        int id = restockQueue.front();
        restockQueue.pop();
        Product& p = products[indexOf[id]];
        p.inQueue = false;
        int add;
        cout << "Restocking " << p.name << " (current qty " << p.qty << ")\n";
        cout << "Enter quantity to add: "; cin >> add;
        if (add > 0) p.qty += add;
        cout << "Stock updated.\n";
    }

    void showRestockQueue() {
        if (restockQueue.empty()) { cout << "Restock queue is empty.\n"; return; }
        queue<int> temp = restockQueue;     // copy so we don't destroy the queue
        cout << "Products waiting for restock:\n";
        while (!temp.empty()) {
            cout << " - " << products[indexOf[temp.front()]].name << endl;
            temp.pop();
        }
    }

    // ----- OS: save to file -----
    void saveToFile() {
        ofstream f(FILE_NAME.c_str());
        for (int i = 0; i < count; i++)
            f << products[i].id << " " << products[i].name << " "
              << products[i].price << " " << products[i].qty << "\n";
        f.close();
        cout << "Data saved to " << FILE_NAME << endl;
    }

    // ----- OS: load from file -----
    void loadFromFile() {
        ifstream f(FILE_NAME.c_str());
        if (!f) return;                      // no file yet
        int id, q; string name; double p;
        while (count < MAX && f >> id >> name >> p >> q) {
            products[count] = Product(id, name, p, q);
            indexOf[id] = count;
            count++;
        }
        f.close();
    }
};

// ---------------- main ----------------
int main() {
    Inventory inv;
    inv.loadFromFile();

    // simple admin login
    string pass;
    cout << "=== Inventory Management System ===\n";
    cout << "Admin password: ";
    cin >> pass;
    if (pass != "admin123") {
        cout << "Wrong password. Exiting.\n";
        return 0;
    }

    int ch;
    do {
        cout << "\n1. Add product\n"
             << "2. Show products\n"
             << "3. Make sale (bill)\n"
             << "4. Undo last sale\n"
             << "5. Sales history\n"
             << "6. Show restock queue\n"
             << "7. Process restock\n"
             << "8. Save & Exit\n"
             << "Choice: ";
        cin >> ch;
        switch (ch) {
            case 1: inv.addProduct(); break;
            case 2: inv.showAll(); break;
            case 3: inv.makeSale(); break;
            case 4: inv.undoSale(); break;
            case 5: inv.showHistory(); break;
            case 6: inv.showRestockQueue(); break;
            case 7: inv.processRestock(); break;
            case 8: inv.saveToFile(); cout << "Goodbye!\n"; break;
            default: cout << "Invalid choice.\n";
        }
    } while (ch != 8);

    return 0;
}
