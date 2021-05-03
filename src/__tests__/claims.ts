
// Need a test to be in this file 
test("claims dummy test", () => {
    expect(1).toBe(1);
});

export let claim_p1 = {
    format: "internal",
    id: {
        branch: "p",
        version: 1
    },
    ___tables: {
        person: {
            id: {
                data_type: "int",
                is_primary_key: true,
                has_auto_increment: true
            },
            name: {
                data_type: "varchar",
                max_length: 32,
            },
        },
    }
};

export let claim_p2 = {
    format: "internal",
    id: {
        branch: "p",
        version: 2
    },
    ___tables: {
        person: {
            name: {
                // Change the data type 
                data_type: "text",
            },
            age: {
                // A new column 
                data_type: "int",
            },
        },
    }
};

export let state_p2 = {
    format: "internal",
    ___tables: {
        person: {
            id: {
                data_type: "int",
                is_primary_key: true,
                has_auto_increment: true
            },
            name: {
                data_type: "text"
            },
        },
    }
};

export let claim_use_p1 = {
    format: "internal",
    id: {
        branch: "up",
        version: 1
    },
    depends: {
        p: 1
    },
    ___tables: {
        person: {
            name: {
                data_type: "text",
            },
        },
    }
};


export let claim_use_p2 = {
    format: "internal",
    id: {
        branch: "up",
        version: 1
    },
    depends: {
        p: 2
    },
    ___tables: {
        person: {
            name: {
                data_type: "text",
            },
        },
    }
};

